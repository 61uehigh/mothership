import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getFeedback } from "@/composition/server";
import { feedbackSchema } from "@/features/feedback/model/Feedback";

/**
 * ### POST
 *
 * Starts a session that works on your feedback in a worktree of mothership's
 * source (developer mode). Body: `FeedbackInput`.
 *
 * @returns 201 with the new session; 400 for an invalid body or a worktree that could not be made;
 *   409 when developer mode is not set up.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, feedbackSchema);
  if (body instanceof Response) return body;
  try {
    return Response.json(await getFeedback().submit(body), { status: 201 });
  } catch (error) {
    // Anything else is Claude, `gh`, or git failing to make the worktree.
    return errorResponse(error, 400);
  }
}
