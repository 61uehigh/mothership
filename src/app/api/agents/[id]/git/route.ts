import { z } from "zod";
import { errorResponse, orNotFound, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ allowed: z.boolean() });

/**
 * ### POST
 *
 * Turns git access on (`{ allowed: true }`) or off for a session: commits and
 * pushes from its folder (Claude asks you before each push; Codex reaches
 * GitHub's hosts unasked, see `codexSandbox`). Only for backends
 * with git access (`AGENT_CAPABILITIES.gitAccess`).
 *
 * @returns The updated agent, 404 for an unknown agent, or 409 for a backend without git access.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/git">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const runtime = getRuntime();
  const agent = orNotFound(runtime.get(id), "session-not-found");
  if (agent instanceof Response) return agent;
  try {
    return Response.json(runtime.setAllowGit(id, body.allowed));
  } catch (error) {
    return errorResponse(error);
  }
}
