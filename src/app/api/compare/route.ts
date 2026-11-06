import { z } from "zod";
import { COMPARE_NAME_MAX } from "@/features/sessions/model/Compare";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { optionalFolderSchema } from "@/app/api/_lib/folderSchema";
import { compareAttemptSchema } from "@/features/sessions/model/AgentEvents";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(COMPARE_NAME_MAX),
  task: z.string().trim().min(1),
  role: z.string().optional(),
  mcp: z.array(z.string()).optional(),
  repo: optionalFolderSchema,
  attempts: z
    .array(compareAttemptSchema)
    .min(2)
    .max(5),
});

/**
 * ### POST
 *
 * Starts the same task on 2–5 agents, each in its own worktree of `repo`,
 * grouped for side-by-side comparison (see `AgentRuntime.compare`).
 *
 * @returns `{ group, agents }`, or 400 for an invalid body (including a backend
 *   that cannot edit files) or a non-git `repo`; a typed error keeps its own
 *   status (409 at a runtime safety limit).
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    const { name, task, role, mcp, repo, attempts } = body;
    return Response.json(await getRuntime().compare({ name, task, role, mcp, repo, attempts }), { status: 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
