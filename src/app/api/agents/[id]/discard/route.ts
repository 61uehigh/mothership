import { errorResponse } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

/**
 * ### POST
 *
 * Stops the agent and deletes its worktree and branch, unmerged work included.
 *
 * @returns `{ ok: true }`, or 409 when it has no active worktree or git fails.
 */
export async function POST(_request: Request, context: RouteContext<"/api/agents/[id]/discard">): Promise<Response> {
  const { id } = await context.params;
  try {
    await getRuntime().discard(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
