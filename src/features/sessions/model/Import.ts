import type { AgentEventRecord } from "@/features/sessions/model/Agent";

/**
 * ### ImportProvider
 *
 * Where a local session can be imported from.
 */
export type ImportProvider = "claude" | "codex";

/**
 * ### ImportableSession
 *
 * A Claude Code or Codex session on this Mac that can be brought into
 * mothership, as listed by `GET /api/import`.
 */
export type ImportableSession = {
  provider: ImportProvider;
  /** The provider's session id. */
  id: string;
  /** Custom title, summary, or first prompt. */
  title: string;
  /** Folder the session worked in, when known. */
  cwd: string | undefined;
  branch: string | undefined;
  /** Epoch milliseconds of the last change. */
  lastModified: number;
};

/**
 * ### HistoryItem
 *
 * One step of an imported conversation, in order: something you said, or
 * something the agent did (text, a tool call, a tool result).
 */
export type HistoryItem =
  | { kind: "message"; text: string }
  | { kind: "event"; event: AgentEventRecord["event"] }
  /** A line from mothership itself, e.g. where the imported history ends. */
  | { kind: "note"; text: string };
