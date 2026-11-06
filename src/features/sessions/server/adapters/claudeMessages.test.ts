import { describe, expect, it } from "vitest";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { toAgentEvents, type ClaudeStreamState } from "@/features/sessions/server/adapters/claudeMessages";

// Only the fields the parser reads; the SDK's message types carry many more.
const message = (value: object) => value as SDKMessage;

describe("toAgentEvents", () => {
  it("reports the session once and pairs a sub-agent's start, steps, and end", () => {
    const state: ClaudeStreamState = { sessionReported: false, subagents: new Set() };
    const start = toAgentEvents(
      message({
        type: "assistant",
        session_id: "s1",
        parent_tool_use_id: null,
        message: { content: [{ type: "tool_use", id: "t1", name: "Agent", input: { description: "Look around", subagent_type: "Explore" } }] },
      }),
      state,
      "subscription",
    );
    const step = toAgentEvents(
      message({ type: "assistant", session_id: "s1", parent_tool_use_id: "t1", message: { content: [{ type: "tool_use", id: "t2", name: "Grep", input: {} }] } }),
      state,
      "subscription",
    );
    const end = toAgentEvents(
      message({
        type: "user",
        session_id: "s1",
        parent_tool_use_id: null,
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "<frame>report</frame>" }] }] },
        tool_use_result: { content: [{ type: "text", text: "  report  " }] },
      }),
      state,
      "subscription",
    );

    expect(start).toEqual([
      { type: "session", ref: "s1" },
      { type: "subagent", phase: "start", id: "t1", description: "Look around", kind: "Explore", model: undefined },
    ]);
    expect(step).toEqual([{ type: "subagent", phase: "step", id: "t1", tool: "Grep" }]);
    expect(end).toEqual([{ type: "subagent", phase: "end", id: "t1", output: "report", failed: false }]);
    expect(state.subagents.size).toBe(0);
  });

  it("reads a result that claims success but is an error as a failure with its reason", () => {
    const state: ClaudeStreamState = { sessionReported: true, subagents: new Set() };
    const events = toAgentEvents(message({ type: "result", subtype: "success", is_error: true, result: " Not logged in \n" }), state, "api");
    expect(events).toEqual([{ type: "error", message: "Claude run failed: Not logged in", failure: { code: "run-failed", provider: "claude", reason: "Not logged in" } }]);
  });

  it("keeps a plain tool's result as its own event", () => {
    const state: ClaudeStreamState = { sessionReported: true, subagents: new Set(["other"]) };
    const events = toAgentEvents(
      message({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t9", content: "ok", is_error: true }] } }),
      state,
      "api",
    );
    expect(events).toEqual([{ type: "tool_result", id: "t9", output: "ok", failed: true }]);
  });
});
