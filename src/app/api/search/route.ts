import { z } from "zod";
import { parseQuery } from "@/app/api/_lib/http";
import { getDashboard } from "@/composition/server";

const querySchema = z.object({
  q: z.string({ error: "q is required" }).trim().min(1, { error: "q is required" }),
});

/**
 * ### GET
 *
 * Unified search across every tool that has a dashboard widget. `?q=` is
 * required.
 *
 * @returns `SearchGroup`s, or 400 when the query is empty.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json(await getDashboard().search(query.q));
}
