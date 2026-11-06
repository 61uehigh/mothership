import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ text: z.string().trim().min(1) });

/**
 * ### POST
 *
 * Queues a human message for the agent; it runs as soon as the agent is free.
 *
 * @returns The queued message, 400 for an invalid body, 404 for an unknown
 *   agent, or 409 when its worktree was merged or discarded.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/messages">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const runtime = getRuntime();
  if (runtime.get(id) === undefined) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(runtime.sendMessage(id, body.text, undefined), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
