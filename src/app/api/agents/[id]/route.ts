import { errorResponse } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The agent with its messages and events, or 404.
 */
export async function GET(_request: Request, context: RouteContext<"/api/agents/[id]">): Promise<Response> {
  const { id } = await context.params;
  const detail = getRuntime().detail(id);
  return detail === undefined ? Response.json({ error: "Not found" }, { status: 404 }) : Response.json(detail);
}

/**
 * ### DELETE
 *
 * Permanently deletes the session, its history, and its worktree (unmerged
 * work included).
 *
 * @returns 204, 404 for an unknown agent, or 409 while it is running or when
 *   its worktree cannot be removed.
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/agents/[id]">): Promise<Response> {
  const { id } = await context.params;
  const runtime = getRuntime();
  if (runtime.get(id) === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    await runtime.deleteAgent(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
