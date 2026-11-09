import { describe, expect, it } from "vitest";
import type { Agent, AgentQuestion } from "@/features/sessions/model/Agent";
import { todoSessionState } from "@/features/todos/model/todoSession";

// Only the fields todoSessionState reads.
const agent = (id: string, fields: Partial<Agent> = {}): Agent => ({ id, parentId: undefined, status: "idle", ...fields }) as Agent;
const question = (agentId: string, status: AgentQuestion["status"] = "open"): AgentQuestion => ({ id: `q-${agentId}`, agentId, status }) as AgentQuestion;

describe("todoSessionState", () => {
  it("puts a question from the lead or any sub-agent first, then work, then how the last turn ended", () => {
    const agents = [agent("lead"), agent("child", { parentId: "lead" }), agent("grandchild", { parentId: "child", status: "running" })];
    expect(todoSessionState("lead", agents, [question("grandchild")])).toBe("needs-you");
    expect(todoSessionState("lead", agents, [question("grandchild", "answered")])).toBe("working");
    expect(todoSessionState("lead", [agent("lead"), agent("other", { status: "running" })], [question("other")])).toBe("done");
    expect(todoSessionState("lead", [agent("lead", { status: "failed" })], [])).toBe("failed");
    expect(todoSessionState("lead", [agent("lead", { status: "interrupted" })], [])).toBe("stopped");
  });
});
