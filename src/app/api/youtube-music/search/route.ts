import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getYouTubeMusicAuth } from "@/composition/server";
import { searchSongs } from "@/features/youtube-music/server/youtubeApi";
import { YOUTUBE_SEARCH_MAX } from "@/features/youtube-music/model/YouTubeMusic";

const querySchema = z.object({ q: z.string().trim().min(1).max(YOUTUBE_SEARCH_MAX) });

/**
 * ### GET
 *
 * `?q=` searches music videos that can play embedded. Each search costs 100
 * of the day's 10,000 Data API quota units.
 *
 * @returns `{ tracks }`, or `{ error, code }` when YouTube fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json({ tracks: await searchSongs(await getYouTubeMusicAuth().accessToken(), query.q) });
  } catch (error) {
    return errorResponse(error);
  }
}
