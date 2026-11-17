import { createHash, randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { z } from "zod";
import { writeQueueFor, writeFileAtomic } from "@/platform/files";
import { parseOAuthClientFile, type OAuthClient } from "@/platform/google/oauthClientFile";
import type { HttpError } from "@/platform/http/HttpError";
import type { GoogleClientProblem, GoogleOAuthCode, GoogleOAuthSignInFailure } from "@/lib/apiErrorCodes";
import { errorMessage } from "@/lib/errors";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const TIMEOUT_MS = 15_000;
/** How long a started sign-in waits for Google to send you back. */
const SIGN_IN_TTL_MS = 10 * 60_000;
/** Refresh this long before the access token runs out, so a request never carries a dying one. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * ### GoogleConnectionStatus
 *
 * Where a Google sign-in stands.
 * - `unconfigured`: no usable OAuth client; `reason` says why.
 * - `disconnected`: the client is set but nobody signed in with it.
 * - `expired`: Google no longer accepts the sign-in (test-mode clients expire weekly).
 * - `connected`: ready.
 */
export type GoogleConnectionStatus = {
  state: "unconfigured" | "disconnected" | "expired" | "connected";
  /** Why there is no usable client; only while `unconfigured`. */
  reason: GoogleClientProblem | undefined;
  /** A client file is saved (it may still be broken, see `reason`). */
  clientSaved: boolean;
  /** The client's Google Cloud project, for links into it. */
  projectId: string | undefined;
  /** A name for the account the service itself gives (e.g. a YouTube channel), once read. */
  account: string | undefined;
  /** The signed-in Google account's email address. */
  email: string | undefined;
  /** Why the last sign-in came back without being kept. */
  signInError: GoogleOAuthSignInFailure | undefined;
  /** How many sign-ins this server started have ended, so a card tells the one it just began from an earlier one. */
  signInsEnded: number;
};

/**
 * ### ClientResult
 *
 * What {@link readClientFile} found: the client, or why there is none
 * (`saved` tells a broken saved file from no file at all).
 */
export type ClientResult = { client: OAuthClient } | { reason: GoogleClientProblem; saved: boolean };

/** {@link GoogleClientProblem} in English, for the `error` text beside the `unconfigured` code. */
const CLIENT_PROBLEM_TEXT: Record<GoogleClientProblem, string> = {
  "client-missing": "No Google OAuth client is chosen; choose one in Settings → Connections",
  "client-unreadable": "The saved OAuth client file is gone or unreadable. Choose it again",
  "client-invalid": "The saved file is not a Google OAuth client file. Choose it again",
};

/**
 * ### readClientFile
 *
 * @param file - The client file's path, from a `.env.local` variable; empty when unset.
 * @returns The OAuth client in `file`, or why there is none.
 */
export async function readClientFile(file: string): Promise<ClientResult> {
  if (file === "") return { reason: "client-missing", saved: false };
  let json: unknown;
  try {
    json = JSON.parse(await readFile(/*turbopackIgnore: true*/ file, "utf8"));
  } catch {
    return { reason: "client-unreadable", saved: true };
  }
  const client = parseOAuthClientFile(json);
  return client === undefined ? { reason: "client-invalid", saved: true } : { client };
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
 * ### googleAuthorizeUrl
 *
 * @param scope - Space-separated scopes; `openid email` is worth adding to show who signed in.
 * @returns Google's consent page for `scope`, asking for a refresh token so the sign-in lasts.
 */
export function googleAuthorizeUrl(scope: string, client: OAuthClient, redirectUri: string, state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    // Google gives a refresh token only on consent; asking every time makes sure a new sign-in gets one.
    // The account chooser too, since the account you want may not be the one the browser uses now.
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/**
 * ### loopbackCallbackUrl
 *
 * Google accepts any port on a loopback address for a Desktop app client,
 * and prefers the IP to `localhost`.
 *
 * @param host - The request's `Host`, which the request guard has checked is local.
 * @param path - The callback page, outside `/api/` (the request guard refuses
 *   cross-site reads of `/api/`, and Google's redirect is a cross-site navigation;
 *   the `state` check stands in for it).
 */
export function loopbackCallbackUrl(host: string, path: string): string {
  return `http://${host.replace(/^localhost(?=:|$)/, "127.0.0.1")}${path}`;
}

const tokenFileSchema = z.object({
  refreshToken: z.string().min(1),
  accessToken: z.string().optional(),
  /** Epoch milliseconds the access token stops working. */
  expiresAt: z.number().optional(),
  /** A name for the account the service gives, shown as who is signed in. */
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
 * ### GoogleOAuthOptions
 *
 * @property file - Where the refresh token is kept (mode 600).
 * @property scope - What the sign-in asks Google for.
 * @property service - The service's name in messages, e.g. `YouTube`, `Gmail`.
 * @property readClient - Reads the OAuth client.
 * @property whoAmI - A name for the account, read with a fresh access token after signing in.
 * @property fail - Makes the feature's own error, so its routes answer with its codes.
 */
export type GoogleOAuthOptions = {
  file: string;
  scope: string;
  service: string;
  readClient: () => Promise<ClientResult>;
  whoAmI?: (token: string) => Promise<string | undefined>;
  fail: (message: string, status: number, code: GoogleOAuthCode) => HttpError;
};

/**
 * ### GoogleOAuth
 *
 * One Google sign-in of the app's own (outside any MCP server): starts and
 * finishes the OAuth flow with PKCE, keeps the refresh token in one file
 * readable only by you, and hands out fresh access tokens. Holds the
 * sign-ins in progress, so each one lives on the shared server state.
 */
export class GoogleOAuth {
  readonly #options: GoogleOAuthOptions;
  readonly #pending = new Map<string, Pending>();
  #refreshing: Promise<string> | undefined;
  /** Set when Google refused the refresh token, until you sign in again. */
  #expired = false;
  /** Why the last sign-in did not finish, until the next one starts. */
  #signInError: GoogleOAuthSignInFailure | undefined;
  /** Counts disconnects, so a sign-in that finishes after one does not bring the token back. */
  #disconnects = 0;
  #signInsEnded = 0;

  constructor(options: GoogleOAuthOptions) {
    this.#options = options;
  }

  get #file(): string {
    return this.#options.file;
  }

  /**
   * ### status
   *
   * Reads the client file and token file fresh on each call; never throws for a missing or unreadable file.
   */
  async status(): Promise<GoogleConnectionStatus> {
    const found = await this.#options.readClient();
    const ended = { signInError: this.#signInError, signInsEnded: this.#signInsEnded };
    const none = { account: undefined, email: undefined, ...ended };
    if ("reason" in found) return { ...none, state: "unconfigured", reason: found.reason, clientSaved: found.saved, projectId: undefined };
    const saved = await this.#read(found.client);
    const base = { reason: undefined, clientSaved: true, projectId: found.client.projectId, ...ended };
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
  failSignIn(state: string | null, failure: GoogleOAuthSignInFailure): void {
    if (state === null || !this.#pending.has(state)) return;
    this.#pending.delete(state);
    this.#signInError = failure;
    this.#signInsEnded++;
  }

  /**
   * ### rememberAccount
   *
   * Keeps a name for the account (from a connection test) as who is signed in.
   */
  async rememberAccount(account: string | undefined): Promise<void> {
    if (account === undefined) return;
    const found = await this.#options.readClient();
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
   * @throws HttpError With code `unconfigured` when there is no OAuth client.
   */
  async startSignIn(redirectUri: string): Promise<string> {
    const client = await this.#client();
    const now = Date.now();
    for (const [state, pending] of this.#pending) if (now - pending.startedAt > SIGN_IN_TTL_MS) this.#pending.delete(state);
    const state = randomBytes(16).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.#pending.set(state, { verifier, redirectUri, startedAt: now });
    this.#signInError = undefined;
    return googleAuthorizeUrl(this.#options.scope, client, redirectUri, state, verifier);
  }

  /**
   * ### finishSignIn
   *
   * Trades the code Google sent back for tokens and keeps the refresh token.
   *
   * @returns `undefined` once the sign-in is kept, else why it was not: the
   *   `state` is not a sign-in this server started (`sign-in-unknown`, which
   *   ends no sign-in here), it is older than ten minutes, Google refused the
   *   code or gave no refresh token, or you disconnected while Google answered.
   */
  async finishSignIn(state: string, code: string): Promise<GoogleOAuthSignInFailure | undefined> {
    const pending = this.#pending.get(state);
    this.#pending.delete(state);
    // Not this server's sign-in: nobody here is waiting on it, so it does not end one.
    if (pending === undefined) return { code: "sign-in-unknown" };
    const failure = await this.#finish(pending, code).catch((error: unknown): GoogleOAuthSignInFailure => ({ code: "sign-in-failed", detail: errorMessage(error) }));
    this.#signInError = failure;
    if (failure === undefined) this.#expired = false;
    this.#signInsEnded++;
    return failure;
  }

  async #finish(pending: Pending, code: string): Promise<GoogleOAuthSignInFailure | undefined> {
    if (Date.now() - pending.startedAt > SIGN_IN_TTL_MS) return { code: "sign-in-timed-out" };
    const disconnects = this.#disconnects;
    const client = await this.#client();
    const tokens = await this.#token({
      grant_type: "authorization_code",
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    });
    const refreshToken = tokens.refresh_token;
    if (refreshToken === undefined) return { code: "no-refresh-token" };
    // Who signed in is a nicety: a disabled API or a used-up quota must not undo the sign-in.
    const account = await (this.#options.whoAmI?.(tokens.access_token) ?? Promise.resolve(undefined)).catch(() => undefined);
    const email = emailFromIdToken(tokens.id_token);
    const kept = await writeQueueFor(this.#file)(async () => {
      if (this.#disconnects !== disconnects) return false;
      await this.#write({
        refreshToken,
        accessToken: tokens.access_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        clientId: client.clientId,
        ...(account === undefined ? {} : { account }),
        ...(email === undefined ? {} : { email }),
      });
      return true;
    });
    return kept ? undefined : { code: "disconnected-meanwhile" };
  }

  /**
   * ### accessToken
   *
   * @returns A token good for at least another minute, refreshed when needed
   *   (one refresh at a time, however many requests ask).
   * @throws HttpError With code `disconnected` before you sign in,
   *   `expired` when Google no longer accepts the sign-in.
   */
  async accessToken(): Promise<string> {
    const saved = await this.#read(await this.#client());
    if (saved === undefined) throw this.#options.fail(`Sign in to ${this.#options.service} first`, 409, "disconnected");
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
      this.#disconnects += 1;
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
      if ((error as { code?: unknown }).code === "expired") this.#expired = true;
      throw error;
    }
    await writeQueueFor(this.#file)(async () => {
      // Read again: the account name may have been saved while Google answered, or the sign-in
      // removed or replaced, in which case writing would bring the old one back.
      const current = await this.#readAny();
      if (current === undefined || current.refreshToken !== saved.refreshToken) return;
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
    const result = await this.#options.readClient();
    if ("reason" in result) throw this.#options.fail(CLIENT_PROBLEM_TEXT[result.reason], 409, "unconfigured");
    return result.client;
  }

  async #token(form: Record<string, string>): Promise<z.infer<typeof tokenResponseSchema>> {
    const { service, fail } = this.#options;
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw fail("Could not reach Google to sign in", 502, "failed");
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = z.object({ error: z.string(), error_description: z.string().optional() }).safeParse(body);
      // invalid_grant: the refresh token was revoked, or a test-mode client's week is up.
      if (error.success && error.data.error === "invalid_grant") {
        throw fail(`Google no longer accepts the ${service} sign-in: it expired or was revoked (invalid_grant: ${error.data.error_description ?? "no details"})`, 401, "expired");
      }
      const reason = error.success ? (error.data.error_description ?? error.data.error) : `status ${response.status}`;
      throw fail(`Google refused the sign-in: ${reason}`, 502, "failed");
    }
    const tokens = tokenResponseSchema.safeParse(body);
    if (!tokens.success) throw fail("Google answered the sign-in in an unexpected shape", 502, "failed");
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
