import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { routeContainer } from "@/app/api/docker/_lib/routeContainer";
import { containerLogs } from "@/features/docker/server/docker";

const querySchema = z.object({
  tail: z.coerce.number().int().min(1).max(5000).default(300),
});

/**
 * ### GET
 *
 * `?tail=N` (1 to 5000, default 300)
 *
 * @returns The last N lines of the container's stdout and stderr with
 *   timestamps (`text/plain`, at most 1 MB; `X-Logs-Truncated: 1` when older
 *   lines were dropped), 400 for an invalid id or query, 404 for an unknown
 *   container, or `{ error, code }` when docker fails.
 */
export async function GET(request: Request, context: RouteContext<"/api/docker/containers/[id]/logs">): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const container = await routeContainer(context.params);
  if (container instanceof Response) return container;
  try {
    const logs = await containerLogs(container.id, query.tail);
    return new Response(logs.text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Logs-Truncated": logs.truncated ? "1" : "0" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
