import { describe, expect, it } from "vitest";
import type { AgentEventRecord } from "@/features/sessions/model/Agent";
import { withToolRuns, type TimelineEntry, type TimelineItem } from "@/features/sessions/ui/sessionTimeline";

let nextId = 1;
const at = (event: AgentEventRecord["event"]): TimelineItem => {
  const id = nextId++;
  return { kind: "event", at: id, record: { id, agentId: "a", event, createdAt: id } };
};
const tool = (id?: string, result?: { output: string; failed: boolean }) => at({ type: "tool", name: "Bash", detail: "ls", id, result });
const message = (text: string): TimelineItem => ({
  kind: "message",
  at: nextId++,
  message: { id: text, agentId: "a", senderId: undefined, kind: "message", text, createdAt: 0, deliveredAt: 0 },
});

const shape = (entries: Array<TimelineEntry>) => entries.map((e) => (e.kind === "tools" ? `tools:${e.uses.length}` : e.kind === "message" ? `message:${e.message.text}` : `event:${e.record.event.type}`));

describe("withToolRuns", () => {
  it("keeps a run going across results and sub-agent steps", () => {
    const items = [tool("1"), at({ type: "tool_result", id: "1", output: "ok", failed: false }), at({ type: "subagent", phase: "step", id: "s", tool: "Read" }), tool("2")];
    expect(shape(withToolRuns(items))).toEqual(["tools:2"]);
  });

  it("ends a run at a message or any other event", () => {
    const items = [tool("1"), message("hi"), tool("2"), at({ type: "text", text: "done" }), tool("3")];
    expect(shape(withToolRuns(items))).toEqual(["tools:1", "message:hi", "tools:1", "event:text", "tools:1"]);
  });

  it("pairs a call with a result that arrives later, by id", () => {
    const [run] = withToolRuns([tool("1"), tool("2"), at({ type: "tool_result", id: "1", output: "listed", failed: true })]);
    expect(run.kind === "tools" && run.uses.map((u) => u.result)).toEqual([{ output: "listed", failed: true }, undefined]);
  });

  it("prefers a result the adapter attached to the call over a paired one", () => {
    const [run] = withToolRuns([tool("1", { output: "inline", failed: false }), at({ type: "tool_result", id: "1", output: "separate", failed: false })]);
    expect(run.kind === "tools" && run.uses[0].result?.output).toBe("inline");
  });

  it("leaves a call without an id unpaired", () => {
    const [run] = withToolRuns([tool(undefined), at({ type: "tool_result", id: "undefined", output: "x", failed: false })]);
    expect(run.kind === "tools" && run.uses[0].result).toBeUndefined();
  });
});
