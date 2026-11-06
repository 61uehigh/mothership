import { errorResponse } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The agent's changes as a unified diff (`text/plain`), or 409 when
 *   it has no active worktree or git fails.
 */
export async function GET(_request: Request, context: RouteContext<"/api/agents/[id]/diff">): Promise<Response> {
  const { id } = await context.params;
  try {
    return new Response(await getRuntime().diff(id), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return errorResponse(error);
  }
}
