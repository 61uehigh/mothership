import { describe, expect, it } from "vitest";
import { nativeSubagents } from "@/features/sessions/ui/team";
import type { AgentEventRecord } from "@/features/sessions/model/Agent";

const record = (id: number, event: AgentEventRecord["event"]): AgentEventRecord => ({ id, agentId: "lead", event, createdAt: id });

describe("nativeSubagents", () => {
  const start = record(1, { type: "subagent", phase: "start", id: "t1", description: "Count files", kind: "Explore", model: undefined });
  const step = record(2, { type: "subagent", phase: "step", id: "t1", tool: "Glob" });

  it("follows a sub-agent from start to its report", () => {
    const end = record(3, { type: "subagent", phase: "end", id: "t1", output: "11 files", failed: false });
    expect(nativeSubagents([start, step, end], false)).toMatchObject([{ id: "t1", status: "done", steps: 1, output: "11 files", lastTool: undefined }]);
  });

  it("shows the tool in use while it runs", () => {
    expect(nativeSubagents([start, step], true)).toMatchObject([{ status: "running", lastTool: "Glob" }]);
  });

  it("marks one left running after its turn ended as not finished", () => {
    expect(nativeSubagents([start, step], false)).toMatchObject([{ status: "failed" }]);
  });
});
