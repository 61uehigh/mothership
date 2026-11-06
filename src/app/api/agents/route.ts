import { connection } from "next/server";
import { z } from "zod";
import { SESSION_NAME_MAX } from "@/features/sessions/model/Agent";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { optionalFolderSchema } from "@/app/api/_lib/folderSchema";
import { AGENT_KINDS, EFFORTS } from "@/features/sessions/model/AgentEvents";
import { getRuntime } from "@/composition/server";

const newAgentSchema = z.object({
  name: z.string().trim().min(1).max(SESSION_NAME_MAX),
  role: z.string().optional(),
  provider: z.enum(AGENT_KINDS),
  model: z.string().trim().min(1).optional(),
  effort: z.enum(EFFORTS).optional(),
  parentId: z.string().optional(),
  mcp: z.array(z.string()).optional(),
  initialMessage: z.string().optional(),
  /** Directory to work in; defaults to the default folder (Settings → Agents). */
  repo: optionalFolderSchema,
  worktree: z.boolean().default(false),
  /** Let it run git in its folder (backends with `AGENT_CAPABILITIES.gitAccess`; pushes need your approval). */
  allowGit: z.boolean().default(false),
});

/**
 * ### GET
 *
 * @returns Every agent and message, for the initial page load.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(getRuntime().snapshot());
}

/**
 * ### POST
 *
 * Creates an agent and, if `initialMessage` is set, starts its first turn.
 *
 * @returns The created agent; 409 at a runtime safety limit; 400 for an invalid
 *   body, an unknown parent, a missing folder, or another failure.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, newAgentSchema);
  if (body instanceof Response) return body;
  const { role, model, effort, parentId, mcp, initialMessage, repo, ...rest } = body;
  try {
    const agent = await getRuntime().createAgent({
      ...rest,
      role,
      model,
      effort,
      parentId,
      mcp,
      initialMessage,
      repo,
      compareGroup: undefined,
      allowGit: body.allowGit,
    });
    return Response.json(agent, { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
