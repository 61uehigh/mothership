import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ answer: z.string().trim().min(1).optional() });

/**
 * ### POST
 *
 * Answers an open question (`{ answer }`) or dismisses it (`{}`); either way
 * the asking agent is told and starts a new turn.
 *
 * @returns The resolved question, or 404 when it does not exist or is already resolved.
 */
export async function POST(request: Request, context: RouteContext<"/api/questions/[id]">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const question = getRuntime().resolveQuestion(id, body.answer);
  return question === undefined ? Response.json({ error: "Not found or already resolved" }, { status: 404 }) : Response.json(question);
}
