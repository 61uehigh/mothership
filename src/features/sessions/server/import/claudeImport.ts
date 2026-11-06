import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { deleteSession, forkSession, getSessionMessages, listSessions, type SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { HistoryItem } from "@/features/sessions/model/Import";
import { assistantEvents, toolResultEvents } from "@/features/sessions/server/adapters/claudeMessages";
import { firstLine, IMPORT_LIST_LIMIT, INJECTED } from "@/features/sessions/server/import/importText";
import type { ImportSource } from "@/features/sessions/server/import/sessionImport";
import { asRecord } from "@/lib/unknownValues";

/** What you typed in a user message, without the text Claude Code injects. */
function typedText(content: unknown): string {
  if (typeof content === "string") return INJECTED.test(content) ? "" : content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => {
      const b = asRecord(block);
      return b?.type === "text" && typeof b.text === "string" && !INJECTED.test(b.text) ? [b.text] : [];
    })
    .join("\n");
}

/**
 * ### claudeHistoryItems
 *
 * A Claude Code transcript as mothership history: what you typed, and the
 * lead's text, tool calls, and sub-agents, parsed the same way as a live
 * turn. A sub-agent's own steps stay out, as in live sessions.
 */
export function claudeHistoryItems(messages: ReadonlyArray<Pick<SessionMessage, "type" | "message" | "parent_tool_use_id">>): Array<HistoryItem> {
  const items: Array<HistoryItem> = [];
  const subagents = new Set<string>();
  for (const m of messages) {
    if (m.parent_tool_use_id !== null) continue;
    const content = asRecord(m.message)?.content;
    if (m.type === "user") {
      const text = typedText(content);
      if (text.trim() !== "") items.push({ kind: "message", text });
      for (const event of toolResultEvents(content, subagents)) items.push({ kind: "event", event });
    } else if (m.type === "assistant") {
      for (const event of assistantEvents(content, subagents)) items.push({ kind: "event", event });
    }
  }
  return items;
}

/**
 * ### claudeImport
 *
 * Claude Code sessions you ran yourself, through the Agent SDK. Headless runs
 * (mothership's own agents among them) and the connector relay in the temp
 * folder are left out. Importing forks the session, so the original stays as it is.
 */
export const claudeImport: ImportSource = {
  async list() {
    // Read past the limit: relay sessions are dropped below, and the list should still be full.
    const sessions = await listSessions({ limit: IMPORT_LIST_LIMIT * 4, includeProgrammatic: false });
    const temp = await realpath(tmpdir()).catch(() => tmpdir());
    return sessions
      .filter((s) => s.cwd === undefined || !(s.cwd.startsWith(temp) || s.cwd.startsWith(tmpdir())))
      .slice(0, IMPORT_LIST_LIMIT)
      .map((s) => ({
        provider: "claude",
        id: s.sessionId,
        title: firstLine(s.customTitle ?? s.summary ?? s.firstPrompt ?? ""),
        cwd: s.cwd,
        branch: s.gitBranch,
        lastModified: s.lastModified,
      }));
  },
  async history(sessionId) {
    return claudeHistoryItems(await getSessionMessages(sessionId));
  },
  fork: {
    async make(session) {
      return (await forkSession(session.id, { title: session.title === "" ? "mothership" : `${session.title} (mothership)` })).sessionId;
    },
    async discard(sessionRef) {
      // Otherwise every failed try leaves another copy of the session in ~/.claude.
      await deleteSession(sessionRef);
    },
  },
};
