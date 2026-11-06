import type { AgentCapabilities } from "@/features/sessions/model/AgentEvents";

/**
 * ### TOOL_GROUPS
 *
 * The sections of a session's tool list, in the order they show.
 */
export const TOOL_GROUPS = ["files", "subagents", "collaboration", "mcp", "connectors"] as const;

/**
 * ### ToolGroup
 *
 * One of {@link TOOL_GROUPS}.
 */
export type ToolGroup = (typeof TOOL_GROUPS)[number];

/**
 * ### BUILT_IN_TOOLS
 *
 * Tools a session gets from its backend or from mothership, which the UI
 * names and describes in its own words. Claude's file, web, and shell tools
 * come first, then Codex's, then those of every session.
 */
export const BUILT_IN_TOOLS = [
  "read",
  "grep",
  "glob",
  "edit",
  "write",
  "webSearch",
  "webFetch",
  "bash",
  "shell",
  "applyPatch",
  "codexWebSearch",
  "git",
  "claudeSubagents",
  "mothership",
] as const;

/**
 * ### BuiltInTool
 *
 * One of {@link BUILT_IN_TOOLS}.
 */
export type BuiltInTool = (typeof BUILT_IN_TOOLS)[number];

/**
 * ### ToolNote
 *
 * Why a tool is unavailable, or a caveat, as a fact the UI words:
 * - `sandboxedToWorktree` / `sandboxedToFolder`: its shell writes only there.
 * - `worktreeOnly`: a shell needs a session in a worktree.
 * - `gitOn` / `gitOnUnasked` / `gitOff`: this session's "Allow git" choice; `gitOnUnasked` for a backend that pushes without asking.
 * - `unsupported`: only backends with `capability` have it.
 * - `notInRole`: the session's role leaves this server out.
 * - `unavailable`: the MCP server cannot be used, for `reason`.
 */
export type ToolNote =
  | { code: "sandboxedToWorktree" | "sandboxedToFolder" | "worktreeOnly" | "gitOn" | "gitOnUnasked" | "gitOff" | "notInRole" }
  | { code: "unsupported"; capability: Exclude<keyof AgentCapabilities, "forksImports" | "asksBeforePush"> }
  | { code: "unavailable"; reason: McpServerUnavailable };

/**
 * ### McpServerUnavailable
 *
 * Why an MCP server in `config/mcp.yaml` cannot be used: Settings turns it
 * off (`off-in-settings`), the file does (`disabled-in-file`, with the file's
 * path), or it reads an unset `.env.local` value (`env-missing`, with its name).
 */
export type McpServerUnavailable = { code: "off-in-settings" } | { code: "disabled-in-file"; file: string } | { code: "env-missing"; variable: string };

/**
 * ### ToolSubject
 *
 * What a row of the tool list is: a {@link BuiltInTool}, or an MCP server or
 * claude.ai connector shown by its own name (`kind` says which, and whether
 * the server is remote or local).
 */
export type ToolSubject = { builtIn: BuiltInTool } | { server: string; kind: "remote" | "local" | "unknown" | "connector" };

/**
 * ### AgentTool
 *
 * One tool (or group of tools) a session can use, as listed in its details
 * column: what it is, whether this session may use it, and how often it has.
 * The server sends only these facts; the UI words them.
 */
export type AgentTool = {
  group: ToolGroup;
  subject: ToolSubject;
  available: boolean;
  note: ToolNote | undefined;
  /** Calls recorded in this session's history. */
  uses: number;
};
