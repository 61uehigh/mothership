import { GmailError } from "@/features/gmail/server/GmailError";
import { GoogleOAuth, loopbackCallbackUrl, readClientFile, type ClientResult } from "@/platform/google/GoogleOAuth";

/**
 * ### GMAIL_SCOPE
 *
 * Read-only Gmail (list and read messages; nothing is sent, changed, or
 * deleted), plus your email address to show which account is signed in.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly openid email";

/**
 * ### readCalendarClient
 *
 * Gmail signs in with Google Calendar's OAuth client
 * (`GOOGLE_OAUTH_CREDENTIALS`): your mail and your calendar are the same
 * work account, so they share its Google Cloud project, and a client that
 * only lets your organisation in fits both. Its sign-in (token file) is
 * Gmail's own, so signing out of one leaves the other.
 *
 * @returns The client, or why there is none.
 */
export async function readCalendarClient(env: Record<string, string | undefined> = process.env): Promise<ClientResult> {
  return readClientFile(env.GOOGLE_OAUTH_CREDENTIALS ?? "");
}

/**
 * ### GmailAuth
 *
 * Your Google sign-in for Gmail (see `GoogleOAuth`), failing with {@link GmailError}s.
 */
export class GmailAuth extends GoogleOAuth {
  /**
   * @param file - Where the refresh token is kept, e.g. `dataPath(".mothership", "gmail-token.json")`.
   * @param client - Reads the OAuth client; {@link readCalendarClient} by default.
   */
  constructor(file: string, client: () => Promise<ClientResult> = () => readCalendarClient()) {
    super({ file, scope: GMAIL_SCOPE, service: "Gmail", readClient: client, fail: (message, status, code) => new GmailError(message, status, code) });
  }
}

/**
 * ### gmailCallbackUrl
 *
 * Where Google sends you back after signing in to Gmail (see `loopbackCallbackUrl`).
 *
 * @param host - The request's `Host`, which the request guard has checked is local.
 */
export function gmailCallbackUrl(host: string): string {
  return loopbackCallbackUrl(host, "/gmail/callback");
}
