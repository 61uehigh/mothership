import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { meetingSummary } from "@/composition/server";
import { HttpError } from "@/platform/http/HttpError";

const querySchema = z.object({ id: z.uuid({ error: "id must be a Nuclino item UUID" }), fresh: z.enum(["1"]).optional() });

/**
 * ### GET
 *
 * Claude's summary of one meeting note: done, decided, to do, and open.
 * Saved per version of the note, so it is made again only after an edit or
 * with `?fresh=1`.
 *
 * @returns `MeetingSummaryView`; 404 for an unknown note, 409 when Nuclino
 *   is not set up, 422 for an empty note, 502 when Nuclino or Claude fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await meetingSummary(query.id, query.fresh === "1"));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
