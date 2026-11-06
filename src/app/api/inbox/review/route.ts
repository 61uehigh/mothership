import { getInbox } from "@/composition/server";
import { errorResponse } from "@/app/api/_lib/http";

/**
 * ### POST
 *
 * Has Claude review the Inbox now, even if it already did today.
 *
 * @returns The `InboxView` with its moves; 401 with `code: "claude-login"` when
 *   the Claude login has expired, 504 `claude-timeout`, or 502
 *   (`claude-bad-answer`, `claude-failed`) when the review fails otherwise.
 */
export async function POST(): Promise<Response> {
  try {
    return Response.json(await getInbox().reviewNow());
  } catch (error) {
    return errorResponse(error, 502);
  }
}
