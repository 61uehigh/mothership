import { getRuntime } from "@/composition/server";

/**
 * ### POST
 *
 * Aborts the agent's current turn.
 *
 * @returns `{ stopped }`: whether a turn was running.
 */
export async function POST(_request: Request, context: RouteContext<"/api/agents/[id]/stop">): Promise<Response> {
  const { id } = await context.params;
  return Response.json({ stopped: getRuntime().stop(id) });
}
