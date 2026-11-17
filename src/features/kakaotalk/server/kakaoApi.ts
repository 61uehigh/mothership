import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { MEMO_MAX_CHARS, type KakaoStatus, type SentMemo } from "@/features/kakaotalk/model/KakaoTalk";
import { readKakao, recordSent, updateKakao, type KakaoToken } from "@/features/kakaotalk/server/kakaoStore";
import { HttpError } from "@/platform/http/HttpError";
import { processState } from "@/platform/processState";

const AUTH_HOST = "https://kauth.kakao.com";
const API_HOST = "https://kapi.kakao.com";
/** Kakao takes this many characters in one text message. */
const MESSAGE_CHARS = 200;
/** How long a sign-in started from Settings may take before its `state` is forgotten. */
const STATE_TTL_MS = 10 * 60_000;
/** Renew the access token this long before it runs out. */
const EXPIRY_MARGIN_MS = 60_000;
const TIMEOUT_MS = 15_000;

/** Sign-ins in progress by their `state`. */
const states = () => processState("kakao.signInStates", () => new Map<string, { redirectUri: string; at: number }>());

/**
 * ### KakaoError
 *
 * Kakao refused a request, or you have not set it up yet. The message is
 * meant to be shown to the user.
 */
export class KakaoError extends HttpError {
  constructor(message: string, status: number, code?: string, options?: ErrorOptions) {
    super(message, status, code, options);
    this.name = "KakaoError";
  }
}

const restKey = () => process.env.KAKAO_REST_API_KEY?.trim() ?? "";
const clientSecret = () => process.env.KAKAO_CLIENT_SECRET?.trim() ?? "";

/**
 * ### serverPlatform
 *
 * @returns The computer the server runs on, as {@link KakaoStatus} names it.
 */
export function serverPlatform(): KakaoStatus["platform"] {
  return process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "other";
}

/**
 * ### kakaoStatus
 *
 * @returns Whether the key is set and you are signed in, and your recent notes.
 */
export async function kakaoStatus(now = Date.now()): Promise<KakaoStatus> {
  const stored = await readKakao();
  return {
    platform: serverPlatform(),
    memo: {
      keySet: restKey() !== "",
      secretSet: clientSecret() !== "",
      connected: restKey() !== "" && stored.token !== undefined && stored.token.refreshExpiresAt > now,
    },
    sent: stored.sent,
  };
}

/**
 * ### authorizeUrl
 *
 * Starts signing in with Kakao: remembers a one-time `state` and builds the
 * Kakao consent page's address, asking only to send messages to yourself.
 *
 * @param redirectUri - This server's callback, which must also be registered in the Kakao app.
 * @throws {@link KakaoError} 400 When `KAKAO_REST_API_KEY` is not set.
 */
export function authorizeUrl(redirectUri: string, now = Date.now()): string {
  if (restKey() === "") throw new KakaoError("Set the Kakao REST API key in Settings → Connections first.", 400, "no-key");
  for (const [key, value] of states()) if (now - value.at > STATE_TTL_MS) states().delete(key);
  const state = randomBytes(16).toString("hex");
  states().set(state, { redirectUri, at: now });
  const params = new URLSearchParams({ response_type: "code", client_id: restKey(), redirect_uri: redirectUri, scope: "talk_message", state });
  return `${AUTH_HOST}/oauth/authorize?${params}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().optional(),
});

const kakaoErrorSchema = z.object({
  error_description: z.string().optional(),
  msg: z.string().optional(),
  code: z.number().optional(),
});

/** Kakao's own words for a failed call, or the status when it gave none. */
async function failure(response: Response, what: string): Promise<KakaoError> {
  const body = kakaoErrorSchema.safeParse(await response.json().catch(() => undefined));
  const detail = body.success ? (body.data.error_description ?? body.data.msg) : undefined;
  const status = response.status === 401 ? 401 : 502;
  return new KakaoError(`${what} failed (Kakao ${response.status}${detail === undefined ? "" : `: ${detail}`}).`, status, response.status === 401 ? "signed-out" : "failed");
}

async function requestToken(params: Record<string, string>): Promise<z.infer<typeof tokenResponseSchema>> {
  const body = new URLSearchParams({ client_id: restKey(), ...params, ...(clientSecret() === "" ? {} : { client_secret: clientSecret() }) });
  const response = await fetch(`${AUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw await failure(response, "Kakao sign-in");
  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new KakaoError("Kakao sign-in answered in an unexpected shape.", 502, "failed");
  return parsed.data;
}

/**
 * ### completeSignIn
 *
 * Trades the code Kakao sent back for tokens and saves them.
 *
 * @throws {@link KakaoError} 400 When `state` is unknown or expired; 502 when Kakao refuses the code.
 */
export async function completeSignIn(code: string, state: string, now = Date.now()): Promise<void> {
  const started = states().get(state);
  states().delete(state);
  if (started === undefined || now - started.at > STATE_TTL_MS) {
    throw new KakaoError("This Kakao sign-in expired or was not started here. Start it again from Settings → Connections.", 400, "bad-state");
  }
  const token = await requestToken({ grant_type: "authorization_code", redirect_uri: started.redirectUri, code });
  if (token.refresh_token === undefined) throw new KakaoError("Kakao sign-in returned no refresh token.", 502, "failed");
  const saved: KakaoToken = {
    accessToken: token.access_token,
    accessExpiresAt: now + token.expires_in * 1000,
    refreshToken: token.refresh_token,
    refreshExpiresAt: now + (token.refresh_token_expires_in ?? 0) * 1000,
  };
  await updateKakao((current) => ({ ...current, token: saved }));
}

/**
 * ### signOut
 *
 * Forgets your Kakao sign-in; the sent list stays.
 */
export async function signOut(): Promise<void> {
  await updateKakao((current) => ({ sent: current.sent }));
}

/** A usable access token, renewed first when it is about to run out. */
async function accessToken(now: number, force = false): Promise<string> {
  const { token } = await readKakao();
  if (restKey() === "" || token === undefined || token.refreshExpiresAt <= now) {
    throw new KakaoError("Sign in with Kakao in Settings → Connections to send notes to yourself.", 401, "signed-out");
  }
  if (!force && token.accessExpiresAt - EXPIRY_MARGIN_MS > now) return token.accessToken;
  const renewed = await requestToken({ grant_type: "refresh_token", refresh_token: token.refreshToken });
  await updateKakao((current) => ({
    ...current,
    token: {
      accessToken: renewed.access_token,
      accessExpiresAt: now + renewed.expires_in * 1000,
      // Kakao sends a new refresh token only when the old one is close to running out.
      refreshToken: renewed.refresh_token ?? token.refreshToken,
      refreshExpiresAt: renewed.refresh_token === undefined ? token.refreshExpiresAt : now + (renewed.refresh_token_expires_in ?? 0) * 1000,
    },
  }));
  return renewed.access_token;
}

/**
 * ### splitMemo
 *
 * Cuts a note into Kakao-sized messages, preferring line breaks and spaces
 * as cut points. Counts characters, not UTF-16 units, so emoji stay whole.
 *
 * @returns The messages in order; none for an empty note.
 */
export function splitMemo(text: string, size = MESSAGE_CHARS): Array<string> {
  const parts: Array<string> = [];
  let rest = [...text.trim()];
  while (rest.length > 0) {
    if (rest.length <= size) {
      parts.push(rest.join(""));
      break;
    }
    const window = rest.slice(0, size);
    const newline = window.lastIndexOf("\n");
    const space = window.lastIndexOf(" ");
    // A break point in the second half keeps pieces from getting tiny.
    const cut = newline >= size / 2 ? newline : space >= size / 2 ? space : size;
    parts.push(rest.slice(0, cut).join("").trimEnd());
    rest = rest.slice(cut);
    while (rest[0] === "\n" || rest[0] === " ") rest = rest.slice(1);
  }
  return parts.filter((part) => part !== "");
}

/**
 * ### memoTemplate
 *
 * The Kakao "text" message template for one piece of a note. The first web
 * address in the note becomes the message's link; Kakao opens it only when
 * its domain is registered in the Kakao app (Platform → Web).
 *
 * @returns The JSON for the `template_object` field.
 */
export function memoTemplate(text: string, fullNote: string): string {
  const url = /https?:\/\/[^\s<>"']+/.exec(fullNote)?.[0];
  const link = url === undefined ? {} : { web_url: url, mobile_web_url: url };
  return JSON.stringify({ object_type: "text", text, link, ...(url === undefined ? {} : { button_title: "Open link" }) });
}

async function sendOne(token: string, template: string): Promise<Response> {
  return fetch(`${API_HOST}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({ template_object: template }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * ### sendMemo
 *
 * Sends a note to your own KakaoTalk chat ("나와의 채팅") and adds it to the
 * sent list. A note longer than Kakao's 200 characters goes out as several
 * messages in order.
 *
 * @throws {@link KakaoError} 400 for an empty or too long note; 401 when you are not signed in; 502 when Kakao refuses.
 */
export async function sendMemo(text: string, now = Date.now()): Promise<SentMemo> {
  const note = text.trim();
  if (note === "") throw new KakaoError("Write something to send.", 400, "empty");
  if ([...note].length > MEMO_MAX_CHARS) throw new KakaoError(`Notes can be at most ${MEMO_MAX_CHARS} characters.`, 400, "too-long");
  let token = await accessToken(now);
  for (const part of splitMemo(note)) {
    const template = memoTemplate(part, note);
    let response = await sendOne(token, template);
    if (response.status === 401) {
      // Kakao can revoke a token early (e.g. a password change); renew once and retry.
      token = await accessToken(now, true);
      response = await sendOne(token, template);
    }
    if (!response.ok) {
      const error = await failure(response, "Sending to KakaoTalk");
      if (response.status === 403) {
        throw new KakaoError("Kakao did not allow sending messages. Turn on the 카카오톡 메시지 전송 (talk_message) consent item in the Kakao app, then sign in again.", 403, "no-scope", { cause: error });
      }
      throw error;
    }
  }
  const memo: SentMemo = { id: randomUUID(), text: note, sentAt: new Date(now).toISOString() };
  await recordSent(memo);
  return memo;
}
