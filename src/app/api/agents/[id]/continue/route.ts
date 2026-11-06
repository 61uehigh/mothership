import { orNotFound } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

/**
 * ### POST
 *
 * Continues a session a restart stopped, with the sub-agents in its team the
 * restart stopped too.
 *
 * @returns `{ continued }`: the sessions continued; 404 for an unknown session.
 */
export async function POST(_request: Request, context: RouteContext<"/api/agents/[id]/continue">): Promise<Response> {
  const { id } = await context.params;
  const runtime = getRuntime();
  const agent = orNotFound(runtime.get(id), "session-not-found");
  if (agent instanceof Response) return agent;
  return Response.json({ continued: runtime.continueAfterRestart(id) });
}
