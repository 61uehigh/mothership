import type { ToolErrorFacts } from "@/features/tools/model/Dashboard";
import { ToolTimeoutError } from "@/platform/mcp/ToolCaller";
import { ToolRateLimitError } from "@/platform/mcp/RateLimitGate";
import { ConnectorClaudeError, ConnectorNotConnectedError, RelayTimeoutError } from "@/platform/mcp/relayErrors";
import { errorMessage } from "@/lib/errors";

/**
 * ### DeadlineError
 *
 * A call that ran past mothership's own deadline for it.
 */
export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`No response within ${ms / 1000} seconds`);
    this.name = "DeadlineError";
  }
}

/**
 * ### ToolErrorOutcome
 *
 * A failed tool call as facts the browser words; the raw message stays for
 * Details. `sendTimedOut` names the service when a write got no answer in
 * time and may still have gone through.
 */
export type ToolErrorOutcome = ToolErrorFacts & { sendTimedOut?: { service: string } };

/**
 * ### toolErrorOutcome
 *
 * Classifies a failed call. A timeout is `timed-out` on a read whoever gave
 * up first (the backends' own timeouts are shorter than mothership's
 * deadlines, so they usually fire first), but on a write that reached the
 * tool it means the send may have happened, so the caller must check before
 * retrying. A timeout that never reached the tool is not a
 * {@link ToolTimeoutError} (see `mcpFailureKind`, and the connector relay's
 * {@link RelayTimeoutError}), so it is never a send timeout. A connector relay
 * Claude refused carries Claude's own code (`claude-login`, `claude-limit`).
 *
 * @param call - `write` with the `service` to name, or a read.
 */
export function toolErrorOutcome(error: unknown, call: { write: true; service: string } | { write: false }): ToolErrorOutcome {
  const message = errorMessage(error);
  if (error instanceof ToolRateLimitError) return { message, code: "rate-limited", retryAt: error.retryAt };
  if (error instanceof ConnectorNotConnectedError) return { message, code: "connector-not-connected", connector: error.connector };
  if (error instanceof ConnectorClaudeError) return { message, code: error.code };
  if (error instanceof RelayTimeoutError) return { message, code: "timed-out" };
  if (error instanceof ToolTimeoutError && call.write) return { message, sendTimedOut: { service: call.service } };
  if (error instanceof DeadlineError || error instanceof ToolTimeoutError) return { message, code: "timed-out" };
  return { message };
}
