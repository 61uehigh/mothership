import { describe, expect, it } from "vitest";
import { DeadlineError, toolErrorOutcome } from "@/features/tools/server/toolErrorOutcome";
import { ToolRateLimitError } from "@/platform/mcp/RateLimitGate";
import { ToolTimeoutError } from "@/platform/mcp/ToolCaller";
import { ConnectorClaudeError, ConnectorNotConnectedError, RelayTimeoutError } from "@/platform/mcp/relayErrors";

const backendTimeout = new ToolTimeoutError("slack did not answer in time");
const write = { write: true, service: "Slack" } as const;
const read = { write: false } as const;

describe("toolErrorOutcome", () => {
  it("says a write that timed out after the call may have gone through", () => {
    expect(toolErrorOutcome(backendTimeout, write)).toEqual({ message: backendTimeout.message, sendTimedOut: { service: "Slack" } });
  });

  it("treats a read the backend gave up on as timed out, not as a send", () => {
    expect(toolErrorOutcome(backendTimeout, read)).toEqual({ message: backendTimeout.message, code: "timed-out" });
  });

  it("treats a read past mothership's deadline as timed out", () => {
    expect(toolErrorOutcome(new DeadlineError(25_000), read).code).toBe("timed-out");
  });

  it("keeps a rate limit rate-limited on a write", () => {
    const outcome = toolErrorOutcome(new ToolRateLimitError("Slack", 1_000), write);
    expect(outcome).toMatchObject({ code: "rate-limited", retryAt: 1_000 });
    expect(outcome.sendTimedOut).toBeUndefined();
  });

  it("codes a claude.ai connector that is not connected, naming the connector", () => {
    const error = new ConnectorNotConnectedError("Google Calendar");
    expect(toolErrorOutcome(error, read)).toEqual({ message: error.message, code: "connector-not-connected", connector: "Google Calendar" });
  });

  it("codes a relay that timed out before calling the tool as timed out, never as a send that may have gone through", () => {
    const error = new RelayTimeoutError("Slack", 45);
    expect(toolErrorOutcome(error, write)).toEqual({ message: error.message, code: "timed-out" });
  });

  it("carries Claude's own code when Claude refused the relay", () => {
    expect(toolErrorOutcome(new ConnectorClaudeError("claude-login", "OAuth token has expired"), read).code).toBe("claude-login");
    expect(toolErrorOutcome(new ConnectorClaudeError("claude-limit", "You've hit your limit"), write)).toEqual({ message: "You've hit your limit", code: "claude-limit" });
  });

  it("does not call another failure on a write a send timeout", () => {
    expect(toolErrorOutcome(new Error("Could not connect to slack: timed out"), write)).toEqual({ message: "Could not connect to slack: timed out" });
  });
});
