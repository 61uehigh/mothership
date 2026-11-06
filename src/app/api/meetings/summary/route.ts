import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getMeetings } from "@/composition/server";

const querySchema = z.object({ id: z.uuid({ error: "id must be a Nuclino item UUID" }), fresh: z.enum(["1"]).optional() });

/**
 * ### GET
 *
 * Claude's summary of one meeting note: done, decided, to do, and open.
 * Saved per version of the note, so it is made again only after an edit or
 * with `?fresh=1`.
 *
 * @returns `MeetingSummaryView`; 404 for an unknown note, 409 when Nuclino
 *   is not set up, 422 for an empty note, 429 (code `rate-limited`) while
 *   Nuclino is rate limiting and the note is not cached, 502 when Nuclino
 *   fails, and Claude's failures as `askClaudeJson` codes them.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await getMeetings().summary(query.id, query.fresh === "1"));
  } catch (error) {
    return errorResponse(error, 502);
  }
}
