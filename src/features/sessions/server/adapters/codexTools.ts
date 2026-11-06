import type { BuiltInTool } from "@/features/sessions/model/AgentTools";
import type { AdapterTools } from "@/features/sessions/server/adapters/AgentAdapter";

const ROW_OF: Record<string, BuiltInTool> = { shell: "shell", patch: "applyPatch", web_search: "codexWebSearch" };

/**
 * ### codexTools
 *
 * Codex always has its sandboxed shell, its patch tool, and web search. MCP
 * calls are named `<server>.<tool>`.
 */
export const codexTools: AdapterTools = {
  builtIn: () => [
    { tool: "shell", available: true, note: { code: "sandboxedToFolder" } },
    { tool: "applyPatch", available: true, note: undefined },
    { tool: "codexWebSearch", available: true, note: undefined },
  ],
  usageKey: (name) => {
    const server = /^([\w-]+)\./.exec(name);
    return server === null ? (ROW_OF[name] ?? name) : `mcp:${server[1]}`;
  },
};
