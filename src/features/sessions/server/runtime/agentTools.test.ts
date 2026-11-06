import { describe, expect, it } from "vitest";
import type { Agent, AgentEventRecord } from "@/features/sessions/model/Agent";
import { agentTools } from "@/features/sessions/server/runtime/agentTools";

const agent: Agent = {
  id: "a",
  name: "lead",
  role: undefined,
  provider: "claude",
  model: undefined,
  effort: undefined,
  parentId: undefined,
  status: "idle",
  sessionRef: undefined,
  workingDirectory: "/tmp",
  mcp: undefined,
  createdAt: 0,
  lastActivityAt: 0,
  statusNote: undefined,
  links: [],
  worktree: undefined,
  compareGroup: undefined,
  archivedAt: undefined,
  allowGit: false,
};

describe("agentTools", () => {
  it("counts calls to a claude.ai connector whose name has characters other than spaces", () => {
    const call: AgentEventRecord = { id: 1, agentId: "a", event: { type: "tool", name: "mcp__claude_ai_Acme_Docs__search", detail: "{}" }, createdAt: 0 };
    const rows = agentTools(agent, [call], { servers: [], claudeConnectors: new Map([["acme", "Acme.Docs"]]), unavailable: [] });
    expect(rows.find((row) => row.name === "Acme.Docs")).toMatchObject({ uses: 1 });
  });

  it("gives a Codex lead mothership's tools and explains what only Claude has", () => {
    const rows = agentTools({ ...agent, provider: "codex" }, [], { servers: [], claudeConnectors: new Map(), unavailable: [] });
    expect(rows.find((row) => row.name === "mothership")).toMatchObject({ available: true });
    expect(rows.find((row) => row.name === "Git")).toMatchObject({ available: false, note: expect.stringContaining("Claude sessions only") });
    expect(rows.find((row) => row.name === "Claude sub-agents")).toMatchObject({ available: false, note: expect.stringContaining("mothership's sub-agents") });
  });

  it("counts a Codex lead's calls to mothership's tools", () => {
    const call: AgentEventRecord = { id: 1, agentId: "a", event: { type: "tool", name: "mothership.set_status", detail: "{}" }, createdAt: 0 };
    const rows = agentTools({ ...agent, provider: "codex" }, [call], { servers: [], claudeConnectors: new Map(), unavailable: [] });
    expect(rows.find((row) => row.name === "mothership")).toMatchObject({ uses: 1 });
  });
});
