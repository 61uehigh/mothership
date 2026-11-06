import { describe, expect, it } from "vitest";
import { claudeHistoryItems } from "@/features/sessions/server/import/claudeImport";

describe("claudeHistoryItems", () => {
  it("keeps what you typed, drops injected text and sub-agent internals, and ends sub-agents like a live turn", () => {
    const items = claudeHistoryItems([
      { type: "user", parent_tool_use_id: null, message: { content: [{ type: "text", text: "<system-reminder>x</system-reminder>" }, { type: "text", text: "Fix it" }] } },
      { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "t1", name: "Task", input: {} }] } },
      { type: "assistant", parent_tool_use_id: "t1", message: { content: [{ type: "text", text: "inside the sub-agent" }] } },
      { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] } },
    ]);
    expect(items).toEqual([
      { kind: "message", text: "Fix it" },
      { kind: "event", event: { type: "subagent", phase: "start", id: "t1", description: "Sub-agent", kind: "general-purpose", model: undefined } },
      { kind: "event", event: { type: "subagent", phase: "end", id: "t1", output: "done", failed: false } },
    ]);
  });
});
