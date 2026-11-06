import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getDashboard, getMeetings } from "@/composition/server";
import { highlightNames } from "@/features/tools/server/sourceUtils";

const querySchema = z.object({ id: z.uuid({ error: "id must be a Nuclino item UUID" }) });

/**
 * ### GET
 *
 * One meeting note's body, for the full note under its summary. Read like
 * the summary's note, so a Nuclino rate limit answers with the cached copy.
 *
 * @returns A `NuclinoDoc` with your names highlighted; 404 for an unknown
 *   note, 409 when Nuclino is not set up, 429 (code `rate_limited`) while
 *   Nuclino is rate limiting and the note is not cached, 502 when Nuclino fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    const [note, names] = await Promise.all([getMeetings().note(query.id), getDashboard().myNames()]);
    return Response.json({ ...note, markdown: highlightNames(note.markdown, names) });
  } catch (error) {
    return errorResponse(error, 502);
  }
}
