import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { getSessionMessages, listSessions } from "@anthropic-ai/claude-agent-sdk";
import { clipToolOutput } from "@/features/sessions/model/AgentEvents";
import type { HistoryItem, ImportableSession } from "@/features/sessions/model/Import";

const LIST_LIMIT = 50;
const CODEX_SESSIONS = path.join(homedir(), ".codex", "sessions");
/** Text the tools inject into the conversation that you did not type. */
// Both tools wrap what they inject in XML-style tags (<environment_context>, <system-reminder>, …),
// which people do not start their own messages with.
const INJECTED = /^\s*(<[A-Za-z_][\w-]*(\s[^>]*)?>|# AGENTS\.md instructions)/;

function record(value: unknown): Record<string, unknown> | undefined {
  // Narrowed to a non-array object, so the cast only names its value type.
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const b = record(block);
      return typeof b?.text === "string" ? b.text : "";
    })
    .filter((t) => t !== "")
    .join("\n");
}

function firstLine(text: string, max = 80): string {
  // Skip Markdown headings such as "## Referenced ChatGPT conversation:" for something more telling.
  const lines = text.trim().split("\n").map((l) => l.trim()).filter((l) => l !== "");
  const line = lines.find((l) => !l.startsWith("#")) ?? lines[0] ?? "";
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

// --- Claude Code ------------------------------------------------------------

async function listClaude(): Promise<Array<ImportableSession>> {
  // Headless runs (mothership's own agents among them) are not sessions you worked in.
  // Read past the limit: relay sessions are dropped below, and the list should still be full.
  const sessions = await listSessions({ limit: LIST_LIMIT * 4, includeProgrammatic: false });
  // mothership's connector relay runs in the temp folder and can still be listed; leave it out.
  const temp = await realpath(tmpdir()).catch(() => tmpdir());
  return sessions
    .filter((s) => s.cwd === undefined || !(s.cwd.startsWith(temp) || s.cwd.startsWith(tmpdir())))
    .slice(0, LIST_LIMIT)
    .map((s) => ({
    provider: "claude",
    id: s.sessionId,
    title: firstLine(s.customTitle ?? s.summary ?? s.firstPrompt ?? "(untitled)"),
    cwd: s.cwd,
    branch: s.gitBranch,
    lastModified: s.lastModified,
  }));
}

async function claudeHistory(sessionId: string): Promise<Array<HistoryItem>> {
  const messages = await getSessionMessages(sessionId);
  const items: Array<HistoryItem> = [];
  const subagents = new Set<string>();
  for (const m of messages) {
    // A sub-agent's own steps stay out of the lead's history, as in live sessions.
    if (m.parent_tool_use_id !== null) continue;
    const content = record(m.message)?.content;
    if (m.type === "user") {
      if (typeof content === "string") {
        if (!INJECTED.test(content) && content.trim() !== "") items.push({ kind: "message", text: content });
        continue;
      }
      if (!Array.isArray(content)) continue;
      const text = content
        .map((block) => record(block))
        .filter((b) => b?.type === "text" && typeof b.text === "string" && !INJECTED.test(b.text))
        .map((b) => String(b?.text))
        .join("\n");
      if (text.trim() !== "") items.push({ kind: "message", text });
      for (const block of content) {
        const b = record(block);
        if (b?.type !== "tool_result" || typeof b.tool_use_id !== "string") continue;
        const output = clipToolOutput(textOf(b.content));
        if (subagents.has(b.tool_use_id)) {
          items.push({ kind: "event", event: { type: "subagent", phase: "end", id: b.tool_use_id, output, failed: b.is_error === true } });
        } else {
          items.push({ kind: "event", event: { type: "tool_result", id: b.tool_use_id, output, failed: b.is_error === true } });
        }
      }
    } else if (m.type === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        const b = record(block);
        if (b?.type === "text" && typeof b.text === "string" && b.text.trim() !== "") {
          items.push({ kind: "event", event: { type: "text", text: b.text } });
        } else if (b?.type === "tool_use" && typeof b.name === "string" && typeof b.id === "string") {
          const input = record(b.input);
          if (b.name === "Agent" || b.name === "Task") {
            subagents.add(b.id);
            items.push({
              kind: "event",
              event: {
                type: "subagent",
                phase: "start",
                id: b.id,
                description: typeof input?.description === "string" ? input.description : "Sub-agent",
                kind: typeof input?.subagent_type === "string" ? input.subagent_type : "general-purpose",
                model: typeof input?.model === "string" ? input.model : undefined,
              },
            });
          } else {
            items.push({ kind: "event", event: { type: "tool", name: b.name, detail: JSON.stringify(b.input ?? {}), id: b.id } });
          }
        }
      }
    }
  }
  return items;
}

// --- Codex --------------------------------------------------------------------

/** Every `rollout-*.jsonl` under ~/.codex/sessions (YYYY/MM/DD folders). */
async function codexFiles(): Promise<Array<string>> {
  const files = await readdir(CODEX_SESSIONS, { recursive: true }).catch(() => []);
  return files.filter((f) => /rollout-.*\.jsonl$/.test(f)).map((f) => path.join(CODEX_SESSIONS, f));
}

function parseLines(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        const value = record(JSON.parse(line));
        return value === undefined ? [] : [value];
      } catch {
        return [];
      }
    });
}

/** User text Codex shows as yours, without the instructions it injects. */
function codexUserText(payload: Record<string, unknown>): string | undefined {
  if (payload.type !== "message" || payload.role !== "user") return undefined;
  const text = textOf(payload.content);
  return text.trim() === "" || INJECTED.test(text) ? undefined : text;
}

async function codexSessionFile(file: string): Promise<ImportableSession | undefined> {
  const [text, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
  const lines = parseLines(text);
  const meta = record(lines.find((l) => l.type === "session_meta")?.payload);
  const id = typeof meta?.id === "string" ? meta.id : undefined;
  if (id === undefined) return undefined;
  // Headless SDK runs (mothership's own Codex agents among them) and Codex's internal
  // sub-agent sessions are not conversations you had, like Claude's programmatic ones.
  if (meta?.originator === "codex_sdk_ts" || meta?.source === "exec" || record(meta?.source) !== undefined) return undefined;
  const firstPrompt = lines.map((l) => record(l.payload)).find((p) => p !== undefined && codexUserText(p) !== undefined);
  const git = record(meta?.git);
  return {
    provider: "codex",
    id,
    title: firstLine(firstPrompt === undefined ? "(untitled)" : (codexUserText(firstPrompt) ?? "")),
    cwd: typeof meta?.cwd === "string" ? meta.cwd : undefined,
    branch: typeof git?.branch === "string" ? git.branch : undefined,
    lastModified: info.mtimeMs,
  };
}

async function listCodex(): Promise<Array<ImportableSession>> {
  const files = await codexFiles();
  // Newest files first by modification time, then only the ones listed are read.
  const dated = await Promise.all(files.map(async (file) => ({ file, mtime: (await stat(file)).mtimeMs })));
  const newest = dated.sort((a, b) => b.mtime - a.mtime).slice(0, LIST_LIMIT);
  const sessions = await Promise.all(newest.map(({ file }) => codexSessionFile(file).catch(() => undefined)));
  return sessions.filter((s): s is ImportableSession => s !== undefined);
}

async function codexHistory(sessionId: string): Promise<Array<HistoryItem>> {
  const file = (await codexFiles()).find((f) => f.endsWith(`${sessionId}.jsonl`));
  if (file === undefined) throw new Error(`Codex session ${sessionId} was not found in ~/.codex/sessions`);
  const items: Array<HistoryItem> = [];
  for (const line of parseLines(await readFile(file, "utf8"))) {
    if (line.type !== "response_item") continue;
    const p = record(line.payload);
    if (p === undefined) continue;
    const user = codexUserText(p);
    if (user !== undefined) {
      items.push({ kind: "message", text: user });
    } else if (p.type === "message" && p.role === "assistant") {
      const text = textOf(p.content);
      if (text.trim() !== "") items.push({ kind: "event", event: { type: "text", text } });
    } else if ((p.type === "function_call" || p.type === "custom_tool_call" || p.type === "local_shell_call") && typeof p.call_id === "string") {
      const name = typeof p.name === "string" ? p.name : "shell";
      const detail = typeof p.arguments === "string" ? p.arguments : typeof p.input === "string" ? p.input : JSON.stringify(p.action ?? {});
      items.push({ kind: "event", event: { type: "tool", name: name === "shell" || name === "exec_command" ? "shell" : name, detail, id: p.call_id } });
    } else if ((p.type === "function_call_output" || p.type === "custom_tool_call_output") && typeof p.call_id === "string") {
      const output = typeof p.output === "string" ? p.output : JSON.stringify(p.output ?? "");
      items.push({ kind: "event", event: { type: "tool_result", id: p.call_id, output: clipToolOutput(output), failed: false } });
    }
  }
  return items;
}

// --- Public -------------------------------------------------------------------

/**
 * ### listImportable
 *
 * Recent local sessions, newest first: Claude Code's through the Agent SDK
 * (sessions you ran yourself, not headless ones), Codex's from the files in
 * ~/.codex/sessions.
 */
export async function listImportable(provider: "claude" | "codex"): Promise<Array<ImportableSession>> {
  const sessions = provider === "claude" ? await listClaude() : await listCodex();
  return sessions.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * ### readHistory
 *
 * The conversation of a local session as mothership messages and events, in
 * order. Sub-agent internals are left out; tool outputs are cut like live ones.
 *
 * @throws Error When the session cannot be found or read.
 */
export function readHistory(provider: "claude" | "codex", sessionId: string): Promise<Array<HistoryItem>> {
  return provider === "claude" ? claudeHistory(sessionId) : codexHistory(sessionId);
}
