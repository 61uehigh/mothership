import {
  Bot,
  FilePen,
  FilePlus,
  FileSearch,
  FileText,
  Globe,
  MessageCircleQuestion,
  Plug,
  Search,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * ### ToolCall
 *
 * A tool call made readable: what was done (`verb`), to what (`target`), and
 * what the expanded card can show.
 */
export type ToolCall = {
  icon: LucideIcon;
  verb: string;
  /** The file, command, query, or channel acted on; empty when there is none. */
  target: string;
  /** Show `target` in a monospace font (paths and commands). */
  code: boolean;
  /** A short extra note, e.g. `+3 −1` for an edit or `lines 10–40` for a read. */
  note: string | undefined;
  /** Before and after text of an edit, for a small diff. */
  diff: { before: string; after: string } | undefined;
  /** The tool's input as readable text, when it is not already shown as `target` or `diff`. */
  input: string | undefined;
};

const MOTHERSHIP_TOOLS: Record<string, string> = {
  spawn_agent: "Start sub-agent",
  message_agent: "Message agent",
  ask_human: "Ask you",
  set_status: "Set status",
  add_link: "Add link",
  list_agents: "List agents",
  get_agent: "Check agent",
  list_roles: "List roles",
};

function parse(detail: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(detail);
    // Narrowed to a non-array object right here, so the cast only names its value type.
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function str(input: Record<string, unknown> | undefined, ...keys: Array<string>): string | undefined {
  for (const key of keys) {
    const value = input?.[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

const lineCount = (text: string) => (text === "" ? 0 : text.split("\n").length);

/** `snake_case` or `kebab-case` tool names as words: `slack_send_message` → `send message` (service prefix dropped). */
function humanize(tool: string, service: string): string {
  const words = tool.replace(/[_-]+/g, " ").trim();
  const prefix = `${service.toLowerCase()} `;
  return words.toLowerCase().startsWith(prefix) ? words.slice(prefix.length) : words;
}

function pretty(input: Record<string, unknown> | undefined, detail: string): string | undefined {
  if (input === undefined) return detail === "" ? undefined : detail;
  return Object.keys(input).length === 0 ? undefined : JSON.stringify(input, null, 2);
}

/**
 * ### describeTool
 *
 * Turns a recorded tool call (Claude, Codex, or GPT naming) into what a
 * person reads: "Read src/features/sessions/model/Agent.ts", "Run pnpm test", "Slack · send
 * message #general".
 *
 * @param name - Tool name as the provider reported it.
 * @param detail - Its input: JSON for most tools, the command line for a shell.
 * @param workingDirectory - Paths under it are shown relative to it.
 */
export function describeTool(name: string, detail: string, workingDirectory: string): ToolCall {
  const input = parse(detail);
  const rel = (path: string) => (path.startsWith(`${workingDirectory}/`) ? path.slice(workingDirectory.length + 1) : path);
  const relNote = (path: string | undefined) => (path === undefined ? undefined : `in ${rel(path)}`);
  const base = { code: false, note: undefined, diff: undefined, input: undefined };

  switch (name) {
    case "Read": {
      const offset = typeof input?.offset === "number" ? input.offset : undefined;
      const limit = typeof input?.limit === "number" ? input.limit : undefined;
      return {
        ...base,
        icon: FileText,
        verb: "Read",
        target: rel(str(input, "file_path") ?? ""),
        code: true,
        note: offset === undefined ? undefined : `lines ${offset}–${offset + (limit ?? 0)}`,
      };
    }
    case "Edit":
    case "MultiEdit": {
      const before = str(input, "old_string") ?? "";
      const after = str(input, "new_string") ?? "";
      return {
        ...base,
        icon: FilePen,
        verb: "Edit",
        target: rel(str(input, "file_path") ?? ""),
        code: true,
        note: name === "Edit" ? `+${lineCount(after)} −${lineCount(before)}` : undefined,
        diff: name === "Edit" ? { before, after } : undefined,
        input: name === "MultiEdit" ? pretty(input, detail) : undefined,
      };
    }
    case "Write": {
      const content = str(input, "content") ?? "";
      return {
        ...base,
        icon: FilePlus,
        verb: "Write",
        target: rel(str(input, "file_path") ?? ""),
        code: true,
        note: `${lineCount(content)} lines`,
        input: content === "" ? undefined : content,
      };
    }
    case "Bash":
    case "shell":
      return { ...base, icon: SquareTerminal, verb: "Run", target: str(input, "command") ?? detail, code: true, note: str(input, "description") };
    case "Grep":
      return { ...base, icon: Search, verb: "Search", target: str(input, "pattern") ?? "", code: true, note: relNote(str(input, "path", "glob")) };
    case "Glob":
      return { ...base, icon: FileSearch, verb: "Find files", target: str(input, "pattern") ?? "", code: true, note: relNote(str(input, "path")) };
    case "WebSearch":
    case "web_search":
      return { ...base, icon: Globe, verb: "Search the web", target: str(input, "query") ?? detail };
    case "WebFetch":
      return { ...base, icon: Globe, verb: "Fetch", target: str(input, "url") ?? "", code: true };
    case "patch":
      return { ...base, icon: FilePen, verb: "Edit files", target: detail, code: true };
  }

  // MCP tools: Claude names them `mcp__<server>__<tool>`, Codex and GPT `<server>.<tool>`.
  const claudeMcp = /^mcp__(.+?)__(.+)$/.exec(name);
  const dotted = claudeMcp === null ? /^([\w-]+)\.([\w-]+)$/.exec(name) : null;
  const match = claudeMcp ?? dotted;
  if (match !== null) {
    const [, server, tool] = match;
    if (server === "mothership") {
      const verb = MOTHERSHIP_TOOLS[tool] ?? humanize(tool, server);
      const target =
        tool === "spawn_agent"
          ? [str(input, "name"), str(input, "role", "provider")].filter(Boolean).join(" · ")
          : (str(input, "question", "status", "text", "label") ?? "");
      return { ...base, icon: tool === "ask_human" ? MessageCircleQuestion : Bot, verb, target, input: tool === "spawn_agent" ? str(input, "task") : undefined };
    }
    // claude.ai connectors arrive as `claude_ai_Google_Calendar`.
    const service = server.replace(/^claude_ai_/, "").replaceAll("_", " ");
    const target =
      str(input, "channel_id", "channel", "query", "issueId", "id", "eventId", "itemId", "title", "keywords", "workspaceId") ??
      (Array.isArray(input?.keywords) ? input.keywords.join(" ") : "");
    return { ...base, icon: Plug, verb: `${service} · ${humanize(tool, service)}`, target, input: pretty(input, detail) };
  }

  return { ...base, icon: Wrench, verb: name, target: "", input: pretty(input, detail) };
}
