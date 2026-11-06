import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { clipToolOutput } from "@/features/sessions/model/AgentEvents";
import type { HistoryItem, ImportableSession } from "@/features/sessions/model/Import";
import { firstLine, IMPORT_LIST_LIMIT, INJECTED } from "@/features/sessions/server/import/importText";
import type { ImportSource } from "@/features/sessions/server/import/sessionImport";
import { asRecord, textOf } from "@/lib/unknownValues";

const CODEX_SESSIONS = path.join(homedir(), ".codex", "sessions");

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
        const record = asRecord(JSON.parse(line));
        return record === undefined ? [] : [record];
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

/**
 * Reads a rollout only as far as its `session_meta` line and your first
 * message: a rollout can be many megabytes, and the list needs only those.
 */
async function codexSessionFile(file: string, mtimeMs: number): Promise<ImportableSession | undefined> {
  let meta: Record<string, unknown> | undefined;
  let firstPrompt: string | undefined;
  const input = createReadStream(file, "utf8");
  try {
    for await (const line of readline.createInterface({ input, crlfDelay: Infinity })) {
      const [value] = parseLines(line);
      if (value === undefined) continue;
      if (meta === undefined && value.type === "session_meta") meta = asRecord(value.payload);
      const payload = asRecord(value.payload);
      if (firstPrompt === undefined && payload !== undefined) firstPrompt = codexUserText(payload);
      if (meta !== undefined && firstPrompt !== undefined) break;
    }
  } finally {
    input.destroy();
  }
  const id = typeof meta?.id === "string" ? meta.id : undefined;
  if (id === undefined) return undefined;
  // Headless SDK runs (mothership's own Codex agents among them) and Codex's internal
  // sub-agent sessions are not conversations you had, like Claude's programmatic ones.
  if (meta?.originator === "codex_sdk_ts" || meta?.source === "exec" || asRecord(meta?.source) !== undefined) return undefined;
  const git = asRecord(meta?.git);
  return {
    provider: "codex",
    id,
    title: firstLine(firstPrompt ?? ""),
    cwd: typeof meta?.cwd === "string" ? meta.cwd : undefined,
    branch: typeof git?.branch === "string" ? git.branch : undefined,
    lastModified: mtimeMs,
  };
}

/**
 * ### codexHistoryItems
 *
 * A Codex rollout file's lines as mothership history: what you typed, the
 * assistant's text, and tool calls with their outputs. Codex's shell tools
 * (`shell`, `exec_command`, `local_shell_call`) all become `shell`.
 */
export function codexHistoryItems(lines: Array<Record<string, unknown>>): Array<HistoryItem> {
  const items: Array<HistoryItem> = [];
  for (const line of lines) {
    if (line.type !== "response_item") continue;
    const p = asRecord(line.payload);
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

/**
 * ### codexImport
 *
 * Codex sessions from the rollout files in ~/.codex/sessions. Codex cannot
 * fork, so importing continues the same thread.
 */
export const codexImport: ImportSource = {
  async list() {
    const files = await codexFiles();
    // Newest files first by modification time, and only those are read: past the limit,
    // since headless runs are dropped after reading, and the list should still be full.
    // Codex may rotate or delete a rollout after it was listed: that file is skipped, not the list.
    const dated = await Promise.all(files.map((file) => stat(file).then((info) => ({ file, mtime: info.mtimeMs }), () => undefined)));
    const newest = dated
      .filter((entry) => entry !== undefined)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, IMPORT_LIST_LIMIT * 4);
    const sessions = await Promise.all(newest.map(({ file, mtime }) => codexSessionFile(file, mtime).catch(() => undefined)));
    return sessions.filter((s): s is ImportableSession => s !== undefined).slice(0, IMPORT_LIST_LIMIT);
  },
  async history(sessionId) {
    const file = (await codexFiles()).find((f) => f.endsWith(`${sessionId}.jsonl`));
    if (file === undefined) throw new Error(`Codex session ${sessionId} was not found in ~/.codex/sessions`);
    return codexHistoryItems(parseLines(await readFile(file, "utf8")));
  },
  // The thread itself is continued, not copied.
  fork: undefined,
};
