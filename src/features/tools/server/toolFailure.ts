import { describeUnavailable, unavailableParams } from "@/features/tools/model/Dashboard";
import type { ToolOutcome } from "@/features/tools/server/DashboardService";
import { HttpError } from "@/platform/http/HttpError";
import { RATE_LIMITED_CODE } from "@/platform/mcp/RateLimitGate";
import { CLAUDE_LOGIN_CODE } from "@/platform/claudeLogin";

/**
 * ### toolFailure
 *
 * How a route answers a tool call that did not succeed: 409 when the tool is
 * not set up (the reason's facts as `params`, so the browser words it), 404 with code `tool-item-not-found` when the tool says the
 * item does not exist, 429 with code `rate-limited` while it is rate
 * limiting, 504 with code `send-timed-out` when a write got no answer in
 * time (it may still have gone through), 504 with code `timed-out` when a
 * read did not answer in time, 502 with code `connector-not-connected` and
 * the connector as `params` when a claude.ai connector is not connected, 401
 * `claude-login` or 429 `claude-limit` when Claude refused the connector relay,
 * and 502 for any other failure.
 *
 * @param what - What was requested, e.g. `Nuclino doc 1234`, to name it in
 *   the 409 and 404 messages; without it the tool's own message is used.
 */
export function toolFailure(outcome: Exclude<ToolOutcome<unknown>, { status: "ok" }>, what?: string): HttpError {
  if (outcome.status === "unavailable") {
    const reason = describeUnavailable(outcome.reason);
    return new HttpError(what === undefined ? reason : `Can't load ${what}: ${reason}`, 409, outcome.reason.code, { params: unavailableParams(outcome.reason) });
  }
  if (outcome.notFound) return new HttpError(what === undefined ? outcome.message : `${what} was not found or you don't have access to it.`, 404, "tool-item-not-found");
  if (outcome.code === RATE_LIMITED_CODE) return new HttpError(outcome.message, 429, RATE_LIMITED_CODE);
  if (outcome.sendTimedOut !== undefined) return new HttpError(outcome.message, 504, "send-timed-out", { params: outcome.sendTimedOut });
  if (outcome.code === "timed-out") return new HttpError(outcome.message, 504, "timed-out");
  if (outcome.code === CLAUDE_LOGIN_CODE) return new HttpError(outcome.message, 401, CLAUDE_LOGIN_CODE);
  if (outcome.code === "claude-limit") return new HttpError(outcome.message, 429, "claude-limit");
  if (outcome.code === "connector-not-connected") {
    return new HttpError(outcome.message, 502, outcome.code, outcome.connector === undefined ? {} : { params: { connector: outcome.connector } });
  }
  return new HttpError(outcome.message, 502);
}

/**
 * ### toolValue
 *
 * @returns The value of a successful tool call.
 * @throws {@link HttpError} from {@link toolFailure} otherwise.
 */
export function toolValue<T>(outcome: ToolOutcome<T>, what?: string): T {
  if (outcome.status === "ok") return outcome.value;
  throw toolFailure(outcome, what);
}
