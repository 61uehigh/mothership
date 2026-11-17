import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { getYouTubeMusicAuth } from "@/composition/server";
import { LIKED_PLAYLIST_ID } from "@/features/youtube-music/model/YouTubeMusic";
import { listPlaylists } from "@/features/youtube-music/server/youtubeApi";
import { YouTubeMusicError } from "@/features/youtube-music/server/YouTubeMusicError";

/**
 * ### GET
 *
 * @returns `{ playlists, note? }`: liked songs, then your playlists; just liked
 *   songs with a `note` for an account with no YouTube channel; or `{ error, code }`
 *   (see `YouTubeMusicErrorCode`) when you are not signed in or YouTube fails.
 */
export async function GET(): Promise<Response> {
  await connection();
  try {
    return Response.json({ playlists: await listPlaylists(await getYouTubeMusicAuth().accessToken()) });
  } catch (error) {
    if (error instanceof YouTubeMusicError && error.code === "no-channel") {
      return Response.json({ playlists: [{ id: LIKED_PLAYLIST_ID, title: "Liked songs" }], note: error.message });
    }
    return errorResponse(error);
  }
}
