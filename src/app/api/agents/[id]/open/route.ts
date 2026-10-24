import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const run = promisify(execFile);

// macOS `open` arguments per target; the directory is appended.
const OPENERS = {
  terminal: ["-a", "Terminal"],
  vscode: ["-a", "Visual Studio Code"],
  finder: [],
} as const;

const bodySchema = z.object({ app: z.enum(["terminal", "vscode", "finder"]) });

/**
 * ### POST
 *
 * Opens the agent's working directory (its worktree, if it has one) in
 * Terminal, VS Code, or Finder on this Mac. Only the agent's own directory
 * can be opened.
 *
 * @returns `{ ok: true }`; 404 for an unknown agent or a deleted directory,
 *   501 off macOS, 500 when the app fails to open.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/open">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  if (process.platform !== "darwin") return Response.json({ error: "Only supported on macOS" }, { status: 501 });

  const agent = getRuntime().get(id);
  if (agent === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  const exists = await stat(agent.workingDirectory).then((s) => s.isDirectory(), () => false);
  if (!exists) return Response.json({ error: "Working folder not found (it may have been merged or discarded)" }, { status: 404 });

  try {
    await run("open", [...OPENERS[body.app], agent.workingDirectory]);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
