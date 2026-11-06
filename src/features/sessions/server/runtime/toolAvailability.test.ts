import { describe, expect, it } from "vitest";
import type { Agent, AgentEventRecord } from "@/features/sessions/model/Agent";
import type { AgentTool } from "@/features/sessions/model/AgentTools";
import { toolAvailability } from "@/features/sessions/server/runtime/toolAvailability";

const named = (rows: Array<AgentTool>, name: string) =>
  rows.find((row) => ("builtIn" in row.subject ? row.subject.builtIn : row.subject.server) === name);

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
  stoppedByRestart: false,
  suggestion: undefined,
  origin: undefined,
};

describe("toolAvailability", () => {
  it("counts calls to a claude.ai connector whose name has characters other than spaces", () => {
    const call: AgentEventRecord = { id: 1, agentId: "a", event: { type: "tool", name: "mcp__claude_ai_Acme_Docs__search", detail: "{}" }, createdAt: 0 };
    const rows = toolAvailability(agent, [call], { servers: [], claudeConnectors: new Map([["acme", "Acme.Docs"]]), unavailable: [] });
    expect(named(rows, "Acme.Docs")).toMatchObject({ uses: 1 });
  });

  it("gives a Codex lead mothership's tools, git that pushes unasked, and names the capability it lacks for native sub-agents", () => {
    const rows = toolAvailability({ ...agent, provider: "codex", allowGit: true }, [], { servers: [], claudeConnectors: new Map(), unavailable: [] });
    expect(named(rows, "mothership")).toMatchObject({ available: true });
    expect(named(rows, "git")).toMatchObject({ available: true, note: { code: "gitOnUnasked" } });
    expect(named(rows, "claudeSubagents")).toMatchObject({ available: false, note: { code: "unsupported", capability: "nativeSubagents" } });
  });

  it("counts a Claude shell command that runs git toward git, not the shell", () => {
    const git: AgentEventRecord = { id: 1, agentId: "a", event: { type: "tool", name: "Bash", detail: '{"command":"git status"}' }, createdAt: 0 };
    const ls: AgentEventRecord = { id: 2, agentId: "a", event: { type: "tool", name: "Bash", detail: '{"command":"ls"}' }, createdAt: 0 };
    const rows = toolAvailability({ ...agent, allowGit: true }, [git, ls], { servers: [], claudeConnectors: new Map(), unavailable: [] });
    expect(named(rows, "git")).toMatchObject({ uses: 1, available: true, note: { code: "gitOn" } });
    expect(named(rows, "bash")).toMatchObject({ uses: 1, available: false, note: { code: "worktreeOnly" } });
  });

  it("counts a Codex lead's calls to mothership's tools", () => {
    const call: AgentEventRecord = { id: 1, agentId: "a", event: { type: "tool", name: "mothership.set_status", detail: "{}" }, createdAt: 0 };
    const rows = toolAvailability({ ...agent, provider: "codex" }, [call], { servers: [], claudeConnectors: new Map(), unavailable: [] });
    expect(named(rows, "mothership")).toMatchObject({ uses: 1 });
  });
});
