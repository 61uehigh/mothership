import { z } from "zod";
import { errorResponse } from "@/app/api/_lib/http";
import { getYouTubeMusicAuth } from "@/composition/server";
import { listTracks } from "@/features/youtube-music/server/youtubeApi";

/** YouTube playlist ids are URL-safe base64, or `liked` for your liked songs. */
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * ### GET
 *
 * @returns `{ tracks }`: the playlist's playable songs (`liked` for your liked
 *   songs), 400 for a malformed id, or `{ error, code }` when YouTube fails.
 */
export async function GET(_request: Request, context: RouteContext<"/api/youtube-music/playlists/[id]">): Promise<Response> {
  const id = idSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Not a playlist id" }, { status: 400 });
  try {
    return Response.json({ tracks: await listTracks(await getYouTubeMusicAuth().accessToken(), id.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
