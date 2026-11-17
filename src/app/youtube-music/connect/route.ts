import { oauthConnect } from "@/app/_lib/oauthPages";
import { getYouTubeMusicAuth } from "@/composition/server";
import { youtubeCallbackUrl } from "@/features/youtube-music/server/YouTubeMusicAuth";

/**
 * ### GET
 *
 * Starts signing in to YouTube: sends you to Google's consent page, which
 * sends you back to `/youtube-music/callback`. The desktop app opens this in
 * your browser, where you are already signed in to Google.
 *
 * @returns A redirect to Google, or `{ error, code: "unconfigured" }` without an OAuth client.
 */
export const GET = oauthConnect(getYouTubeMusicAuth, youtubeCallbackUrl);
