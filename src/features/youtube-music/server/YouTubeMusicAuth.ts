import { YouTubeMusicError } from "@/features/youtube-music/server/YouTubeMusicError";
import { GoogleOAuth, loopbackCallbackUrl, readClientFile, type ClientResult } from "@/platform/google/GoogleOAuth";

/** Read-only YouTube (playlists, liked videos, search), plus your email address to show which account is signed in. */
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly openid email";

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
 * ### readClient
 *
 * @returns The OAuth client named by {@link CREDENTIALS_VARIABLE}, or why there is none.
 */
export async function readClient(env: Record<string, string | undefined> = process.env): Promise<ClientResult> {
  return readClientFile(env[CREDENTIALS_VARIABLE] ?? "");
}

/**
 * ### YouTubeMusicAuth
 *
 * Your Google sign-in for YouTube (see `GoogleOAuth`), failing with
 * {@link YouTubeMusicError}s.
 */
export class YouTubeMusicAuth extends GoogleOAuth {
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
    super({ file, scope: SCOPE, service: "YouTube", readClient: client, whoAmI, fail: (message, status, code) => new YouTubeMusicError(message, status, code) });
  }
}

/**
 * ### youtubeCallbackUrl
 *
 * Where Google sends you back after signing in to YouTube (see `loopbackCallbackUrl`).
 *
 * @param host - The request's `Host`, which the request guard has checked is local.
 */
export function youtubeCallbackUrl(host: string): string {
  return loopbackCallbackUrl(host, "/youtube-music/callback");
}
