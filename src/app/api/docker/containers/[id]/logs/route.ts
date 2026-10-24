import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { containerLogs, containerRefSchema, findContainer } from "@/features/docker/server/Docker";

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
  const ref = containerRefSchema.safeParse((await context.params).id);
  if (!ref.success) return Response.json({ error: z.prettifyError(ref.error) }, { status: 400 });
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    const container = await findContainer(ref.data);
    if (container === undefined) return Response.json({ error: "No such container" }, { status: 404 });
    const logs = await containerLogs(container.id, query.tail);
    return new Response(logs.text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Logs-Truncated": logs.truncated ? "1" : "0" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
