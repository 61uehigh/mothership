import { getYouTubeMusicAuth } from "@/composition/server";
import type { YouTubeMusicErrorCode, YouTubeMusicTest } from "@/features/youtube-music/model/YouTubeMusic";
import { listPlaylists, whoAmI } from "@/features/youtube-music/server/youtubeApi";
import { YouTubeMusicError } from "@/features/youtube-music/server/YouTubeMusicError";
import { errorMessage } from "@/lib/errors";

/**
 * ### POST
 *
 * Settings' "Test connection": reads your channel and lists your playlists
 * the way the section does (2 or more of the day's quota units).
 *
 * @returns A `YouTubeMusicTest`, always 200: a failure is a result to show, with the raw error.
 */
export async function POST(): Promise<Response> {
  const auth = getYouTubeMusicAuth();
  let result: YouTubeMusicTest;
  try {
    const token = await auth.accessToken();
    const who = await whoAmI(token);
    const playlists = await listPlaylists(token);
    await auth.rememberAccount(who);
    result = { ok: true, who, items: playlists.length };
  } catch (error) {
    const code = error instanceof YouTubeMusicError ? (error.code as YouTubeMusicErrorCode | undefined) : undefined;
    result = { ok: false, message: errorMessage(error), code };
  }
  return Response.json(result);
}
