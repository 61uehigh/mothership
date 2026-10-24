import { HttpError } from "@/platform/http/HttpError";

/**
 * ### RuntimeLimitError
 *
 * A request the runtime refuses: it would exceed a safety limit (depth,
 * sub-agent count, message rate), or the session is in the wrong state for it
 * (running, mid-merge, worktree already merged or discarded). The message is
 * written for whoever asked, human or agent, so they can adjust. Routes answer
 * it with 409.
 */
export class RuntimeLimitError extends HttpError {
  constructor(message: string) {
    super(message, 409);
    this.name = "RuntimeLimitError";
  }
}
