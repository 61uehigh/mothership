import type { AgentEventRecord } from "@/features/sessions/model/Agent";
import type { AgentKind } from "@/features/sessions/model/AgentEvents";

/**
 * ### IMPORT_PROVIDERS
 *
 * Where a local session can be imported from, in the order the import dialog offers them.
 */
export const IMPORT_PROVIDERS = ["claude", "codex"] as const satisfies ReadonlyArray<AgentKind>;

/**
 * ### ImportProvider
 *
 * One of {@link IMPORT_PROVIDERS}.
 */
export type ImportProvider = (typeof IMPORT_PROVIDERS)[number];

/**
 * ### IMPORT_SOURCE_LABELS
 *
 * The app each provider's sessions come from, as the screens name it.
 */
export const IMPORT_SOURCE_LABELS: Record<ImportProvider, string> = { claude: "Claude Code", codex: "Codex" };

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
  /** Custom title, summary, or first prompt; empty when the session has none, and the browser says so in its language. */
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
 * something the agent did (text, a tool call, a tool result), or where the
 * imported part ends (an `imported` note).
 */
export type HistoryItem = { kind: "message"; text: string } | { kind: "event"; event: AgentEventRecord["event"] };
