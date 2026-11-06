import { connection } from "next/server";
import { z } from "zod";
import { parseQuery } from "@/app/api/_lib/http";
import { loadMeetings } from "@/composition/server";

const querySchema = z.object({ refresh: z.enum(["1"]).optional() });

/**
 * ### GET
 *
 * @returns `MeetingsView`: the newest notes in each collection chosen in
 *   Settings → Meetings. `?refresh=1` reads the collections fresh.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json(await loadMeetings(query.refresh === "1"));
}
