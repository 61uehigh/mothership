import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getFeedback } from "@/composition/server";
import { feedbackSchema } from "@/features/feedback/model/Feedback";

/**
 * ### POST
 *
 * Starts a session that works on your feedback in a worktree of mothership's
 * source (developer mode). Body: `FeedbackInput`.
 *
 * @returns 201 with the new session; 400 for an invalid body; 409 when developer mode is not set
 *   up or git refuses to make the worktree (not a repository, detached HEAD); 500 when saving the
 *   screenshot or the session fails.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, feedbackSchema);
  if (body instanceof Response) return body;
  try {
    return Response.json(await getFeedback().submit(body), { status: 201 });
  } catch (error) {
    // Developer mode not set up and git refusing the worktree keep their 409;
    // anything else is the screenshot or the session failing to save.
    return errorResponse(error, 500);
  }
}
