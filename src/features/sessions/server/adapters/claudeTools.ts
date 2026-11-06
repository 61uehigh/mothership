import type { BuiltInTool } from "@/features/sessions/model/AgentTools";
import type { AdapterTools } from "@/features/sessions/server/adapters/AgentAdapter";

/**
 * ### CLAUDE_BUILT_IN_TOOLS
 *
 * Claude Code tools every Claude agent may use (Bash and sub-agents are
 * added separately), with the row of the tool list each one is.
 */
export const CLAUDE_BUILT_IN_TOOLS = {
  Read: "read",
  Grep: "grep",
  Glob: "glob",
  Edit: "edit",
  Write: "write",
  WebSearch: "webSearch",
  WebFetch: "webFetch",
} as const satisfies Record<string, BuiltInTool>;

const ROW_OF: Record<string, BuiltInTool> = { ...CLAUDE_BUILT_IN_TOOLS, Bash: "bash" };

/**
 * ### claudeTools
 *
 * Claude's file and web tools, and Bash only for a session in its own
 * worktree, where the OS sandbox keeps it inside. MCP calls are named
 * `mcp__<server>__<tool>`.
 */
export const claudeTools: AdapterTools = {
  builtIn: ({ worktreeActive }) => [
    ...Object.values(CLAUDE_BUILT_IN_TOOLS).map((tool) => ({ tool, available: true, note: undefined })),
    { tool: "bash", available: worktreeActive, note: { code: worktreeActive ? "sandboxedToWorktree" : "worktreeOnly" } },
  ],
  usageKey: (name) => {
    const server = /^mcp__(.+?)__/.exec(name);
    return server === null ? (ROW_OF[name] ?? name) : `mcp:${server[1]}`;
  },
};
