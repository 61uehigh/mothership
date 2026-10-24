import { getRuntime, mcpConfig } from "@/composition/server";
import { agentTools } from "@/features/sessions/server/runtime/agentTools";

/**
 * ### GET
 *
 * @returns `{ tools }`: what the session can use and how often it has
 *   (`AgentTool` rows), or 404 for an unknown session.
 */
export async function GET(_request: Request, context: RouteContext<"/api/agents/[id]/tools">): Promise<Response> {
  const { id } = await context.params;
  const detail = getRuntime().detail(id);
  if (detail === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ tools: agentTools(detail.agent, detail.events, await mcpConfig()) });
}
