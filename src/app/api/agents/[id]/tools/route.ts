import { orNotFound } from "@/app/api/_lib/http";
import { getRuntime, mcpConfig } from "@/composition/server";
import { toolAvailability } from "@/features/sessions/server/runtime/toolAvailability";

/**
 * ### GET
 *
 * @returns `{ tools }`: what the session can use and how often it has
 *   (`AgentTool` rows), or 404 for an unknown session.
 */
export async function GET(_request: Request, context: RouteContext<"/api/agents/[id]/tools">): Promise<Response> {
  const { id } = await context.params;
  const detail = orNotFound(getRuntime().detail(id), "session-not-found");
  if (detail instanceof Response) return detail;
  return Response.json({ tools: toolAvailability(detail.agent, detail.events, await mcpConfig()) });
}
