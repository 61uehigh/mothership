import type { ToolOutcome } from "@/features/tools/server/DashboardService";
import { HttpError } from "@/platform/http/HttpError";
import { RATE_LIMITED_CODE } from "@/platform/mcp/RateLimitGate";

/**
 * ### toolFailure
 *
 * How a route answers a tool call that did not succeed: 409 when the tool is
 * not set up, 404 when the tool says the item does not exist, 429 with code
 * `rate_limited` while it is rate limiting, and 502 for any other failure.
 *
 * @param what - What was requested, e.g. `Nuclino doc 1234`, to name it in
 *   the 409 and 404 messages; without it the tool's own message is used.
 */
export function toolFailure(outcome: Exclude<ToolOutcome<unknown>, { status: "ok" }>, what?: string): HttpError {
  if (outcome.status === "unavailable") return new HttpError(what === undefined ? outcome.reason : `Can't load ${what}: ${outcome.reason}`, 409);
  if (outcome.notFound) return new HttpError(what === undefined ? outcome.message : `${what} was not found or you don't have access to it.`, 404);
  if (outcome.retryAt !== undefined) return new HttpError(outcome.message, 429, RATE_LIMITED_CODE);
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
