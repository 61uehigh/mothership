import type { ApiErrorCode } from "@/lib/apiErrorCodes";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### RuntimeLimitError
 *
 * A request the runtime refuses: it would exceed a safety limit (depth,
 * sub-agent count, message rate), or the session is in the wrong state for it
 * (running, mid-merge, worktree already merged or discarded). The message is
 * written for whoever asked, human or agent, so they can adjust; the `code`
 * lets the browser word it in your language. Routes answer it with 409.
 */
export class RuntimeLimitError extends HttpError {
  /**
   * @param message - English text for whoever asked; agents read it as it is.
   * @param code - What was refused, worded by the browser.
   */
  constructor(message: string, code: ApiErrorCode) {
    super(message, 409, code);
    this.name = "RuntimeLimitError";
  }
}
