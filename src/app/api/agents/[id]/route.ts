import { errorResponse, orNotFound } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The agent with its messages and events, or 404.
 */
export async function GET(_request: Request, context: RouteContext<"/api/agents/[id]">): Promise<Response> {
  const { id } = await context.params;
  const detail = orNotFound(getRuntime().detail(id), "session-not-found");
  return detail instanceof Response ? detail : Response.json(detail);
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
  const agent = orNotFound(runtime.get(id), "session-not-found");
  if (agent instanceof Response) return agent;
  try {
    await runtime.deleteAgent(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
