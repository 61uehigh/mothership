import { z } from "zod";
import { orNotFound, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ archived: z.boolean() });

/**
 * ### POST
 *
 * Archives (`{ archived: true }`) or restores a session.
 *
 * @returns The updated agent, or 404 for an unknown agent.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/archive">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const runtime = getRuntime();
  const agent = orNotFound(runtime.get(id), "session-not-found");
  if (agent instanceof Response) return agent;
  return Response.json(runtime.setArchived(id, body.archived));
}
