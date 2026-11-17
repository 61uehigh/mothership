import { createHash, randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { z } from "zod";
import type { ConnectionStatus } from "@/features/youtube-music/model/YouTubeMusic";
import { YouTubeMusicError } from "@/features/youtube-music/server/YouTubeMusicError";
import { writeQueueFor, writeFileAtomic } from "@/platform/files";
import { parseOAuthClientFile, type OAuthClient } from "@/platform/google/oauthClientFile";
import { errorMessage } from "@/lib/errors";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Read-only YouTube (playlists, liked videos, search), plus your email address to show which account is signed in. */
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly openid email";
const TIMEOUT_MS = 15_000;
/** How long a started sign-in waits for Google to send you back. */
const SIGN_IN_TTL_MS = 10 * 60_000;
/** Refresh this long before the access token runs out, so a request never carries a dying one. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * ### CREDENTIALS_VARIABLE
 *
 * The `.env.local` variable naming YouTube Music's own Google OAuth client
 * file. Never Google Calendar's (`GOOGLE_OAUTH_CREDENTIALS`): Calendar is
 * often a work account whose client only lets that organisation's accounts
 * in, and YouTube Music is a personal one.
 */
export const CREDENTIALS_VARIABLE = "YOUTUBE_OAUTH_CREDENTIALS";

/**
 * ### ClientResult
 *
 * What {@link readClient} found: the client, or why there is none
 * (`saved` tells a broken saved file from no file at all).
 */
export type ClientResult = { client: OAuthClient } | { reason: string; saved: boolean };

/**
 * ### readClient
 *
 * @returns The OAuth client named by {@link CREDENTIALS_VARIABLE}, or why there is none.
 */
export async function readClient(env: Record<string, string | undefined> = process.env): Promise<ClientResult> {
  const file = env[CREDENTIALS_VARIABLE] ?? "";
  if (file === "") return { reason: "Choose YouTube Music's own Google OAuth client file in Settings → Connections", saved: false };
  let json: unknown;
  try {
    json = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8"));
  } catch {
    return { reason: "The saved OAuth client file is gone or unreadable. Choose it again", saved: true };
  }
  const client = parseOAuthClientFile(json);
  return client === undefined ? { reason: "The saved file is not a Google OAuth client file. Choose it again", saved: true } : { client };
}

/**
 * ### emailFromIdToken
 *
 * Reads the email address from the ID token Google's token endpoint returns.
 * Not verified: it comes straight from Google over TLS, and only labels the card.
 *
 * @returns The address, or `undefined` when there is none.
 */
export function emailFromIdToken(idToken: string | undefined): string | undefined {
  const payload = idToken?.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const claims = z.object({ email: z.string().optional() }).safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return claims.success ? claims.data.email : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ### codeChallenge
 *
 * The PKCE challenge Google checks the verifier against (S256).
 */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * ### authorizeUrl
 *
 * @returns Google's consent page for read access to your YouTube account,
 *   asking for a refresh token so the sign-in lasts.
 */
export function authorizeUrl(client: OAuthClient, redirectUri: string, state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Google gives a refresh token only on consent; asking every time makes sure a new sign-in gets one.
    // The account chooser too, since your YouTube Music may be on another account than your work one.
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

const tokenFileSchema = z.object({
  refreshToken: z.string().min(1),
  accessToken: z.string().optional(),
  /** Epoch milliseconds the access token stops working. */
  expiresAt: z.number().optional(),
  /** Your channel's name, shown as who is signed in. */
  account: z.string().optional(),
  /** The Google account's email address. */
  email: z.string().optional(),
  /** The OAuth client the sign-in was made with; a refresh token only works with its own client, so a sign-in from any other client counts as signed out. */
  clientId: z.string().optional(),
});

type TokenFile = z.infer<typeof tokenFileSchema>;

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
});

type Pending = { verifier: string; redirectUri: string; startedAt: number };

/**
 * ### YouTubeMusicAuth
 *
 * Your Google sign-in for YouTube: starts and finishes the OAuth flow, keeps
 * the refresh token in one file (readable only by you), and hands out fresh
 * access tokens. Holds the sign-ins in progress, so it lives on the shared
 * server state.
 */
export class YouTubeMusicAuth {
  readonly #file: string;
  readonly #readClient: () => Promise<ClientResult>;
  readonly #whoAmI: (token: string) => Promise<string | undefined>;
  readonly #pending = new Map<string, Pending>();
  #refreshing: Promise<string> | undefined;
  /** Set when Google refused the refresh token, until you sign in again. */
  #expired = false;
  /** Why the last sign-in did not finish, until the next one starts. */
  #signInError: string | undefined;

  /**
   * @param file - Where the refresh token is kept, e.g. `dataPath(".mothership", "youtube-music-token.json")`.
   * @param client - Reads the OAuth client; {@link readClient} by default.
   * @param whoAmI - Your channel's name for an access token, read after signing in.
   */
  constructor(
    file: string,
    client: () => Promise<ClientResult> = () => readClient(),
    whoAmI: (token: string) => Promise<string | undefined> = async () => undefined,
  ) {
    this.#file = file;
    this.#readClient = client;
    this.#whoAmI = whoAmI;
  }

  /**
   * ### status
   *
   * Reads the client file and token file fresh on each call; never throws for a missing or unreadable file.
   */
  async status(): Promise<ConnectionStatus> {
    const found = await this.#readClient();
    const none = { account: undefined, email: undefined, signInError: this.#signInError };
    if ("reason" in found) return { ...none, state: "unconfigured", reason: found.reason, clientSaved: found.saved, projectId: undefined };
    const saved = await this.#read(found.client);
    const base = { reason: undefined, clientSaved: true, projectId: found.client.projectId, signInError: this.#signInError };
    if (saved === undefined) return { ...base, ...none, state: "disconnected" };
    return { ...base, account: saved.account, email: saved.email, state: this.#expired ? "expired" : "connected" };
  }

  /**
   * ### failSignIn
   *
   * Remembers why a sign-in this server started came back without a code
   * (you cancelled, or Google refused), so Settings can show it.
   *
   * @param state - The `state` Google sent back; one this server did not start is ignored.
   */
  failSignIn(state: string | null, error: string): void {
    if (state === null || !this.#pending.has(state)) return;
    this.#pending.delete(state);
    this.#signInError = error;
  }

  /**
   * ### rememberAccount
   *
   * Keeps your channel's name (from a connection test) as who is signed in.
   */
  async rememberAccount(account: string | undefined): Promise<void> {
    if (account === undefined) return;
    const found = await this.#readClient();
    if (!("client" in found)) return;
    await writeQueueFor(this.#file)(async () => {
      const saved = await this.#read(found.client);
      if (saved !== undefined && saved.account !== account) await this.#write({ ...saved, account });
    });
  }

  /**
   * ### startSignIn
   *
   * @param redirectUri - Where Google sends you back: this server's callback page.
   * @returns The Google consent page to open.
   * @throws YouTubeMusicError With code `unconfigured` when there is no OAuth client.
   */
  async startSignIn(redirectUri: string): Promise<string> {
    const client = await this.#client();
    const now = Date.now();
    for (const [state, pending] of this.#pending) if (now - pending.startedAt > SIGN_IN_TTL_MS) this.#pending.delete(state);
    const state = randomBytes(16).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.#pending.set(state, { verifier, redirectUri, startedAt: now });
    this.#signInError = undefined;
    return authorizeUrl(client, redirectUri, state, verifier);
  }

  /**
   * ### finishSignIn
   *
   * Trades the code Google sent back for tokens and keeps the refresh token.
   *
   * @throws YouTubeMusicError When `state` is not a sign-in this server started
   *   (or it is older than ten minutes), or Google refuses the code.
   */
  async finishSignIn(state: string, code: string): Promise<void> {
    const pending = this.#pending.get(state);
    this.#pending.delete(state);
    if (pending === undefined || Date.now() - pending.startedAt > SIGN_IN_TTL_MS) {
      throw new YouTubeMusicError("This sign-in was not started here or took too long; start it again from mothership", 400, "failed");
    }
    const client = await this.#client();
    const tokens = await this.#signInToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    });
    const refreshToken = tokens.refresh_token;
    if (refreshToken === undefined) throw new YouTubeMusicError("Google did not return a refresh token; sign in again", 502, "failed");
    // Who signed in is a nicety: a disabled API or a used-up quota must not undo the sign-in.
    const account = await this.#whoAmI(tokens.access_token).catch(() => undefined);
    const email = emailFromIdToken(tokens.id_token);
    await writeQueueFor(this.#file)(() =>
      this.#write({
        refreshToken,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        clientId: client.clientId,
        ...(account === undefined ? {} : { account }),
        ...(email === undefined ? {} : { email }),
      }),
    );
    this.#expired = false;
    this.#signInError = undefined;
  }

  /** The code exchange, remembering why it failed for Settings. */
  async #signInToken(form: Record<string, string>): Promise<z.infer<typeof tokenResponseSchema>> {
    try {
      return await this.#token(form);
    } catch (error) {
      this.#signInError = errorMessage(error);
      throw error;
    }
  }

  /**
   * ### accessToken
   *
   * @returns A token good for at least another minute, refreshed when needed
   *   (one refresh at a time, however many requests ask).
   * @throws YouTubeMusicError With code `disconnected` before you sign in,
   *   `expired` when Google no longer accepts the sign-in.
   */
  async accessToken(): Promise<string> {
    const saved = await this.#read(await this.#client());
    if (saved === undefined) throw new YouTubeMusicError("Sign in to YouTube first", 409, "disconnected");
    if (saved.accessToken !== undefined && saved.expiresAt !== undefined && saved.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return saved.accessToken;
    this.#refreshing ??= this.#refresh(saved).finally(() => (this.#refreshing = undefined));
    return this.#refreshing;
  }

  /**
   * ### disconnect
   *
   * Forgets the sign-in and asks Google to revoke it (best effort: the file
   * goes even when Google cannot be reached).
   */
  async disconnect(): Promise<void> {
    const saved = await writeQueueFor(this.#file)(async () => {
      const current = await this.#readAny();
      await rm(this.#file, { force: true });
      return current;
    });
    this.#expired = false;
    if (saved === undefined) return;
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: saved.refreshToken }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => undefined);
  }

  async #refresh(saved: TokenFile): Promise<string> {
    const client = await this.#client();
    let tokens: z.infer<typeof tokenResponseSchema>;
    try {
      tokens = await this.#token({
        grant_type: "refresh_token",
        refresh_token: saved.refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      });
    } catch (error) {
      if (error instanceof YouTubeMusicError && error.code === "expired") this.#expired = true;
      throw error;
    }
    await writeQueueFor(this.#file)(async () => {
      // Read again: the account name may have been saved while Google answered.
      const current = (await this.#readAny()) ?? saved;
      await this.#write({
        ...current,
        refreshToken: tokens.refresh_token ?? saved.refreshToken,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      });
    });
    this.#expired = false;
    return tokens.access_token;
  }

  async #client(): Promise<OAuthClient> {
    const result = await this.#readClient();
    if ("reason" in result) throw new YouTubeMusicError(result.reason, 409, "unconfigured");
    return result.client;
  }

  async #token(form: Record<string, string>): Promise<z.infer<typeof tokenResponseSchema>> {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new YouTubeMusicError("Could not reach Google to sign in", 502, "failed");
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = z.object({ error: z.string(), error_description: z.string().optional() }).safeParse(body);
      // invalid_grant: the refresh token was revoked, or a test-mode client's week is up.
      if (error.success && error.data.error === "invalid_grant") {
        throw new YouTubeMusicError(
          `Google no longer accepts the YouTube sign-in: it expired or was revoked (invalid_grant: ${error.data.error_description ?? "no details"})`,
          401,
          "expired",
        );
      }
      const reason = error.success ? (error.data.error_description ?? error.data.error) : `status ${response.status}`;
      throw new YouTubeMusicError(`Google refused the sign-in: ${reason}`, 502, "failed");
    }
    const tokens = tokenResponseSchema.safeParse(body);
    if (!tokens.success) throw new YouTubeMusicError("Google answered the sign-in in an unexpected shape", 502, "failed");
    return tokens.data;
  }

  /** The saved sign-in, when it was made with `client`. */
  async #read(client: OAuthClient): Promise<TokenFile | undefined> {
    const saved = await this.#readAny();
    return saved?.clientId === client.clientId ? saved : undefined;
  }

  async #readAny(): Promise<TokenFile | undefined> {
    try {
      const parsed = tokenFileSchema.safeParse(JSON.parse(await readFile(this.#file, "utf8")));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  async #write(tokens: TokenFile): Promise<void> {
    await writeFileAtomic(this.#file, JSON.stringify(tokens), { mode: 0o600 });
  }
}

/**
 * ### CALLBACK_PATH
 *
 * Where Google sends you back after signing in. Outside `/api/` on purpose:
 * the request guard refuses cross-site reads of `/api/`, and Google's
 * redirect is a cross-site navigation. The `state` check stands in for it.
 */
const CALLBACK_PATH = "/youtube-music/callback";

/**
 * ### callbackUrl
 *
 * Google accepts any port on a loopback address for a Desktop app client,
 * and prefers the IP to `localhost`.
 *
 * @param host - The request's `Host`, which the request guard has checked is local.
 */
export function callbackUrl(host: string): string {
  return `http://${host.replace(/^localhost(?=:|$)/, "127.0.0.1")}${CALLBACK_PATH}`;
}
