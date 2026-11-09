import { connection } from "next/server";
import { z } from "zod";
import { parseQuery } from "@/app/api/_lib/http";
import { getDaily } from "@/composition/server";

const querySchema = z.object({
  day: z.iso.date({ error: "day must be a date like 2026-11-09" }),
  refresh: z.enum(["1"]).optional(),
});

/**
 * ### GET
 *
 * `?day=YYYY-MM-DD` (local), `?refresh=1` to skip the cache.
 *
 * @returns `DayActivity`: pull requests, Linear issues, sessions, and meetings of that day,
 *   with the sources that failed under `problems`.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json(await getDaily().activity(query.day, query.refresh === "1"));
}
