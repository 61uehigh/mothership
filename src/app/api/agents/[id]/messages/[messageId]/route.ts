import { apiError, orNotFound } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

/**
 * ### DELETE
 *
 * Cancels a message still waiting in the agent's queue.
 *
 * @returns 204 when it was removed, 404 for an unknown agent, or 409 when the
 *   message is no longer queued (its turn already started).
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/agents/[id]/messages/[messageId]">): Promise<Response> {
  const { id, messageId } = await context.params;
  const runtime = getRuntime();
  const agent = orNotFound(runtime.get(id), "session-not-found");
  if (agent instanceof Response) return agent;
  if (!runtime.cancelMessage(id, messageId)) return apiError("message-not-queued", 409);
  return new Response(null, { status: 204 });
}
