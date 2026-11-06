import { z } from "zod";
import { errorResponse, orNotFound, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ answer: z.string().trim().min(1).optional() });

/**
 * ### POST
 *
 * Answers an open question (`{ answer }`) or dismisses it (`{}`); either way
 * the asking agent is told and starts a new turn. An approval is answered
 * with `allow` or `deny`, which goes to the action waiting on it instead.
 *
 * @returns The resolved question; 404 when it does not exist or is already
 *   resolved; 400 when an approval gets any other answer.
 */
export async function POST(request: Request, context: RouteContext<"/api/questions/[id]">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    const question = orNotFound(getRuntime().resolveQuestion(id, body.answer), "question-not-open");
    return question instanceof Response ? question : Response.json(question);
  } catch (error) {
    return errorResponse(error);
  }
}
