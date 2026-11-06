import { stat } from "node:fs/promises";
import { z } from "zod";
import { apiError, errorResponse, orNotFound, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";
import { openIn } from "@/platform/desktop/desktop";

const bodySchema = z.object({ app: z.enum(["terminal", "vscode", "finder"]) });

/**
 * ### POST
 *
 * Opens the agent's working directory (its worktree, if it has one) in a
 * terminal, VS Code, or Finder (File Explorer on Windows) on this computer.
 * Only the agent's own directory can be opened.
 *
 * @returns `{ ok: true }`; 404 for an unknown agent or a deleted directory,
 *   501 on systems other than macOS and Windows, 500 when the app fails to open.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/open">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;

  const agent = orNotFound(getRuntime().get(id), "session-not-found");
  if (agent instanceof Response) return agent;
  const exists = await stat(agent.workingDirectory).then((s) => s.isDirectory(), () => false);
  if (!exists) return apiError("working-folder-gone", 404);

  try {
    await openIn(body.app, agent.workingDirectory);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
