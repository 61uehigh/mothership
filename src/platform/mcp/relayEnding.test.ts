import { describe, expect, it } from "vitest";
import { relayEnding, type RelayRun } from "@/platform/mcp/relayEnding";

const ended: RelayRun = { cancelled: false, timedOut: false, called: false };

describe("relayEnding", () => {
  it("reports a session that ended by itself without calling the tool as not connected", () => {
    expect(relayEnding(ended)).toBe("not-connected");
  });

  it("reports the relay's clock running out before the call as a timeout that sent nothing, not as not connected", () => {
    expect(relayEnding({ ...ended, timedOut: true })).toBe("timed-out-before-call");
  });

  it("treats an allowed call with no answer as possibly sent, even when the clock ran out", () => {
    expect(relayEnding({ ...ended, timedOut: true, called: true })).toBe("maybe-sent");
  });

  it("keeps a called tool possibly sent when the session then ends with a limit error", () => {
    expect(relayEnding({ ...ended, called: true, errorResult: { subtype: "success", text: "You've hit your limit · resets 5pm" } })).toBe("maybe-sent");
  });

  it("keeps a called tool possibly sent when the SDK also throws the limit error result's text", () => {
    const limit = "You've hit your limit · resets 5pm";
    expect(relayEnding({ ...ended, called: true, errorResult: { subtype: "success", text: limit }, thrown: limit })).toBe("maybe-sent");
  });

  it("keeps a called tool possibly sent when the CLI then exits with an error", () => {
    expect(relayEnding({ ...ended, called: true, thrown: "Claude Code process exited with code 1" })).toBe("maybe-sent");
  });

  it("reports a cancelled call as cancelled whatever else happened", () => {
    expect(relayEnding({ ...ended, cancelled: true, timedOut: true, called: true })).toBe("cancelled");
  });

  it("reads a refused login from the assistant message's error", () => {
    expect(relayEnding({ ...ended, assistantError: "authentication_failed", errorResult: { subtype: "success", text: "Failed" } })).toBe("claude-login");
  });

  it("reads a refused login from an error result's text", () => {
    expect(relayEnding({ ...ended, errorResult: { subtype: "success", text: "Invalid API key · Please run /login" } })).toBe("claude-login");
  });

  it("reads a used-up usage limit from an error result", () => {
    expect(relayEnding({ ...ended, assistantError: "rate_limit", errorResult: { subtype: "success", text: "You've hit your limit · resets 5pm" } })).toBe("claude-limit");
  });

  it("classifies a CLI that exited with a refused login or a limit by Claude's text", () => {
    expect(relayEnding({ ...ended, thrown: "OAuth token has expired" })).toBe("claude-login");
    expect(relayEnding({ ...ended, thrown: "Claude AI usage limit reached" })).toBe("claude-limit");
  });

  it("reports another CLI failure as a failure, not as not connected", () => {
    expect(relayEnding({ ...ended, thrown: "spawn claude ENOENT" })).toBe("failed");
  });

  it("reports an unrecognized error result as a failure, not as not connected", () => {
    expect(relayEnding({ ...ended, errorResult: { subtype: "error_during_execution", text: "boom" } })).toBe("failed");
  });

  it("treats running out of turns without the call as the tool not being there", () => {
    expect(relayEnding({ ...ended, errorResult: { subtype: "error_max_turns", text: "" } })).toBe("not-connected");
  });

  it("treats running out of turns without the call as the tool not being there even when the SDK also throws", () => {
    expect(relayEnding({ ...ended, errorResult: { subtype: "error_max_turns", text: "" }, thrown: "Reached maximum number of turns (3)" })).toBe("not-connected");
  });

  it("reads a used-up limit from an error result the SDK also threw", () => {
    const limit = "You've hit your limit · resets 5pm";
    expect(relayEnding({ ...ended, errorResult: { subtype: "success", text: limit }, thrown: limit })).toBe("claude-limit");
  });

  it("does not report an overloaded API as a used-up limit", () => {
    expect(relayEnding({ ...ended, thrown: 'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}' })).toBe("failed");
  });
});
