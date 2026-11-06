import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";
import { isClaudeAuthFailure, isClaudeLimitFailure } from "@/platform/claudeLogin";

/**
 * ### RelayRun
 *
 * How a connector relay session went, as the relay saw it end.
 */
export type RelayRun = {
  /** The caller gave up on the call. */
  cancelled: boolean;
  /** The relay's own clock ran out and stopped the session. */
  timedOut: boolean;
  /** The model asked for the tool and it was allowed, whether or not an answer came back. */
  called: boolean;
  /** What the SDK threw, other than the relay stopping it: the CLI failed or exited non-zero. */
  thrown?: string;
  /** The session ended with an error result (`is_error`, or a non-`success` subtype). */
  errorResult?: { subtype: string; text: string };
  /** The `error` of an assistant message, e.g. `authentication_failed` for a refused login. */
  assistantError?: SDKAssistantMessageError;
};

/**
 * ### RelayEnding
 *
 * Why a relay session ended without a tool result:
 * - `cancelled`: the caller gave up.
 * - `claude-login`: Claude refused the login.
 * - `claude-limit`: a Claude usage or spend limit is used up.
 * - `failed`: the session failed for another reason; Claude's or the SDK's text says why.
 * - `maybe-sent`: the tool was called but no answer came back, so a send may have gone through.
 * - `timed-out-before-call`: the relay's clock ran out before the tool was called; nothing was sent.
 * - `not-connected`: the session ended on its own without calling the tool, so the connector is not there.
 */
export type RelayEnding = "cancelled" | "claude-login" | "claude-limit" | "failed" | "maybe-sent" | "timed-out-before-call" | "not-connected";

const LOGIN_ERRORS: ReadonlySet<SDKAssistantMessageError> = new Set(["authentication_failed", "oauth_org_not_allowed"]);
const LIMIT_ERRORS: ReadonlySet<SDKAssistantMessageError> = new Set(["rate_limit", "billing_error"]);

function claudeRefusal(assistantError: SDKAssistantMessageError | undefined, text: string): "claude-login" | "claude-limit" | undefined {
  if ((assistantError !== undefined && LOGIN_ERRORS.has(assistantError)) || isClaudeAuthFailure(text)) return "claude-login";
  if ((assistantError !== undefined && LIMIT_ERRORS.has(assistantError)) || isClaudeLimitFailure(text)) return "claude-limit";
  return undefined;
}

/**
 * ### relayEnding
 *
 * Classifies a relay session that ended without a tool result. A call that
 * was allowed counts as sent even with no answer or with an error after it,
 * since guessing "not sent" could send a message twice; only a session that ended by itself, with no
 * call and no error, means the connector is missing. A session that hit
 * max turns without the call is the model not finding the tool, so it is
 * `not-connected` too.
 */
export function relayEnding(run: RelayRun): RelayEnding {
  if (run.cancelled) return "cancelled";
  if (run.called) return "maybe-sent";
  // After an error result the SDK also throws, restating the result's text; the result says more.
  const refusal = claudeRefusal(run.assistantError, [run.errorResult?.text, run.thrown].filter((text) => text !== undefined).join("\n"));
  if (refusal !== undefined) return refusal;
  if (run.errorResult !== undefined) {
    if (run.errorResult.subtype !== "error_max_turns") return "failed";
  } else if (run.thrown !== undefined) {
    return "failed";
  }
  if (run.timedOut) return "timed-out-before-call";
  return "not-connected";
}
