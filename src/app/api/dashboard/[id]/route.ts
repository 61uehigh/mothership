import { z } from "zod";
import { orNotFound, parseQuery } from "@/app/api/_lib/http";
import { getDashboard } from "@/composition/server";

const querySchema = z.object({
  /** `1` bypasses the cache; any other value is ignored. */
  refresh: z.string().optional(),
});

/**
 * ### GET
 *
 * Loads one tool widget. `?refresh=1` bypasses the cache.
 *
 * @returns A `WidgetResult`, or 404 for an unknown or non-tool widget.
 */
export async function GET(request: Request, context: RouteContext<"/api/dashboard/[id]">): Promise<Response> {
  const { id } = await context.params;
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const result = orNotFound(await getDashboard().load(id, query.refresh === "1"), "widget-not-found");
  return result instanceof Response ? result : Response.json(result);
}
