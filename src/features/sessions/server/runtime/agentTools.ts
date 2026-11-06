import type { Agent, AgentEventRecord } from "@/features/sessions/model/Agent";
import type { AgentTool } from "@/features/sessions/model/AgentTools";
import { CLAUDE_BUILT_IN_TOOLS } from "@/features/sessions/server/adapters/ClaudeAdapter";
import type { McpConfig } from "@/platform/mcp/McpRegistry";

const CLAUDE_TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: "Read files",
  Grep: "Search file contents",
  Glob: "Find files by name",
  Edit: "Edit files",
  Write: "Create or overwrite files",
  WebSearch: "Search the web",
  WebFetch: "Fetch a web page",
};

/** Tool names in events, as each provider reports them, mapped to a row of the list. */
function rowKey(name: string): string {
  if (name === "Bash" || name === "shell") return "shell";
  if (name === "Agent" || name === "Task") return "subagents";
  if (name === "patch") return "Edit";
  if (name === "web_search") return "WebSearch";
  const mcp = /^mcp__(.+?)__/.exec(name) ?? /^([\w-]+)\./.exec(name);
  return mcp === null ? name : `mcp:${mcp[1]}`;
}

/**
 * ### agentTools
 *
 * What a session can use, by provider: built-in file and web tools, a shell
 * (only in an active worktree for Claude; Codex always runs commands in its
 * sandbox), Claude's own sub-agents, mothership's collaboration tools, MCP
 * servers it may call, and claude.ai connectors. Counts come from the
 * session's recorded tool calls.
 *
 * @param mcp - The current MCP config (`loadMcpConfig`).
 */
export function agentTools(agent: Agent, events: Array<AgentEventRecord>, mcp: McpConfig): Array<AgentTool> {
  const uses = new Map<string, number>();
  for (const { event } of events) {
    if (event.type === "tool" || (event.type === "subagent" && event.phase === "start")) {
      const isGit = event.type === "tool" && rowKey(event.name) === "shell" && /^\s*(\{"command":")?\s*git\s/.test(event.detail);
      const key = event.type !== "tool" ? "subagents" : isGit ? "git" : rowKey(event.name);
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  const row = (group: string, key: string, name: string, description: string, available: boolean, note?: string): AgentTool => ({
    group,
    name,
    description,
    available,
    note,
    uses: uses.get(key) ?? 0,
  });
  const allowed = (server: string) => agent.mcp === undefined || agent.mcp.includes(server);
  const worktree = agent.worktree?.state === "active";
  const rows: Array<AgentTool> = [];

  switch (agent.provider) {
    case "claude":
      for (const tool of CLAUDE_BUILT_IN_TOOLS) rows.push(row("Files and web", tool, tool, CLAUDE_TOOL_DESCRIPTIONS[tool] ?? tool, true));
      rows.push(
        row(
          "Files and web",
          "shell",
          "Bash",
          "Run commands",
          worktree,
          worktree ? "Sandboxed: writes only inside the worktree, no network" : "Only for sessions working in a worktree",
        ),
      );
      rows.push(
        row(
          "Files and web",
          "git",
          "Git",
          "Commit, edit history, fetch, push",
          agent.allowGit,
          agent.allowGit ? "Plain git commands in this folder, hooks off; every push asks you first" : "Off: turn on Allow git in this session's details",
        ),
      );
      rows.push(row("Sub-agents", "subagents", "Claude sub-agents", "Hand part of a turn to a short-lived Claude agent", true));
      break;
    case "codex":
      rows.push(row("Files and web", "shell", "Shell", "Run commands", true, "Sandboxed: writes only inside the working folder"));
      rows.push(row("Files and web", "Edit", "Apply patch", "Edit files", true));
      rows.push(row("Files and web", "WebSearch", "Web search", "Search the web", true));
      break;
    case "openai":
      rows.push(row("Files and web", "files", "Files and shell", "Read or change files, run commands", false, "GPT agents have no file or shell access"));
      break;
  }

  rows.push(
    row("Collaboration", "mcp:mothership", "mothership", "Create sub-agents, message agents, ask you, set status", true),
  );
  for (const server of mcp.servers) {
    const remoteOnly = agent.provider === "openai" && server.transport !== "http";
    const ok = allowed(server.name) && !remoteOnly;
    rows.push(
      row(
        "MCP servers",
        `mcp:${server.name}`,
        server.name,
        server.transport === "http" ? "Remote MCP server" : "Local MCP server",
        ok,
        !allowed(server.name) ? "Not in this session's role" : remoteOnly ? "GPT can only use remote (http) servers" : undefined,
      ),
    );
  }
  for (const unusable of mcp.unavailable) {
    rows.push(row("MCP servers", `mcp:${unusable.name}`, unusable.name, "MCP server", false, unusable.reason));
  }
  for (const [name, connector] of mcp.claudeConnectors) {
    const ok = agent.provider === "claude" && allowed(name);
    rows.push(
      row(
        "claude.ai connectors",
        `mcp:claude_ai_${connector.replaceAll(" ", "_")}`,
        connector,
        "Your connected claude.ai app",
        ok,
        agent.provider !== "claude" ? "Only Claude agents can use claude.ai connectors" : ok ? undefined : "Not in this session's role",
      ),
    );
  }
  return rows;
}
