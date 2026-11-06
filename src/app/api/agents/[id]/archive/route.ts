import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
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
  if (runtime.get(id) === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(runtime.setArchived(id, body.archived));
}
