import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ allowed: z.boolean() });

/**
 * ### POST
 *
 * Turns git access on (`{ allowed: true }`) or off for a session: plain git
 * commands in its folder, with every push approved by you. Claude only.
 *
 * @returns The updated agent, 404 for an unknown agent, or 409 for another provider.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/git">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const runtime = getRuntime();
  if (runtime.get(id) === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(runtime.setAllowGit(id, body.allowed));
  } catch (error) {
    return errorResponse(error);
  }
}
