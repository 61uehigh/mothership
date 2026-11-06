import type { Agent, AgentEventRecord } from "@/features/sessions/model/Agent";
import { AGENT_CAPABILITIES } from "@/features/sessions/model/AgentEvents";
import type { AgentTool, BuiltInTool, ToolGroup, ToolNote, ToolSubject } from "@/features/sessions/model/AgentTools";
import { ADAPTERS } from "@/features/sessions/server/adapters";
import { connectorServerName, type McpConfig } from "@/platform/mcp/mcpConfig";

/** A shell command recorded as JSON (`{"command":"git …"}`) or as the command itself. */
const GIT_COMMAND = /^\s*(\{"command":")?\s*git\s/;

/** Recorded calls per row: a built-in tool, `git` for shell commands that run git, or `mcp:<server>`. */
function usesByRow(agent: Agent, events: Array<AgentEventRecord>): Map<string, number> {
  const { usageKey } = ADAPTERS[agent.provider].tools;
  const uses = new Map<string, number>();
  for (const { event } of events) {
    let key: string | undefined;
    if (event.type === "subagent" && event.phase === "start") key = "claudeSubagents";
    if (event.type === "tool") {
      const row = usageKey(event.name);
      key = (row === "bash" || row === "shell") && GIT_COMMAND.test(event.detail) ? "git" : row;
    }
    if (key !== undefined) uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  return uses;
}

/**
 * ### toolAvailability
 *
 * What a session can use, as facts for its details column: its backend's
 * own tools (see `AdapterTools`), git and native sub-agents where the
 * backend has them, mothership's collaboration tools, the MCP servers it may
 * call, and claude.ai connectors. Counts come from the session's recorded
 * tool calls.
 *
 * @param mcp - The current MCP config (`loadMcpConfig`).
 */
export function toolAvailability(agent: Agent, events: Array<AgentEventRecord>, mcp: McpConfig): Array<AgentTool> {
  const uses = usesByRow(agent, events);
  const capabilities = AGENT_CAPABILITIES[agent.provider];
  const row = (group: ToolGroup, subject: ToolSubject, key: string, available: boolean, note?: ToolNote): AgentTool => ({
    group,
    subject,
    available,
    note,
    uses: uses.get(key) ?? 0,
  });
  const builtIn = (group: ToolGroup, tool: BuiltInTool, available: boolean, note?: ToolNote) =>
    row(group, { builtIn: tool }, tool, available, note);
  const allowed = (server: string) => agent.mcp === undefined || agent.mcp.includes(server);
  const role = (server: string): ToolNote | undefined => (allowed(server) ? undefined : { code: "notInRole" });
  const gitOn = agent.allowGit && capabilities.gitAccess;

  return [
    ...ADAPTERS[agent.provider].tools
      .builtIn({ worktreeActive: agent.worktree?.state === "active" })
      .map(({ tool, available, note }) => builtIn("files", tool, available, note)),
    builtIn("files", "git", gitOn, capabilities.gitAccess ? { code: gitOn ? (capabilities.asksBeforePush ? "gitOn" : "gitOnUnasked") : "gitOff" } : { code: "unsupported", capability: "gitAccess" }),
    builtIn("subagents", "claudeSubagents", capabilities.nativeSubagents, capabilities.nativeSubagents ? undefined : { code: "unsupported", capability: "nativeSubagents" }),
    row("collaboration", { builtIn: "mothership" }, "mcp:mothership", true),
    ...mcp.servers.map((server) =>
      row("mcp", { server: server.name, kind: server.transport === "http" ? "remote" : "local" }, `mcp:${server.name}`, allowed(server.name), role(server.name)),
    ),
    ...mcp.unavailable.map((server) =>
      row("mcp", { server: server.name, kind: "unknown" }, `mcp:${server.name}`, false, { code: "unavailable", reason: server.reason }),
    ),
    ...[...mcp.claudeConnectors].map(([name, connector]) =>
      row(
        "connectors",
        { server: connector, kind: "connector" },
        `mcp:${connectorServerName(connector)}`,
        capabilities.claudeConnectors && allowed(name),
        capabilities.claudeConnectors ? role(name) : { code: "unsupported", capability: "claudeConnectors" },
      ),
    ),
  ];
}
