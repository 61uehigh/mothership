import { AGENT_CAPABILITIES } from "@/features/sessions/model/AgentEvents";
import type { HistoryItem, ImportableSession, ImportProvider } from "@/features/sessions/model/Import";
import { claudeImport } from "@/features/sessions/server/import/claudeImport";
import { codexImport } from "@/features/sessions/server/import/codexImport";

/**
 * ### ImportSource
 *
 * Where local sessions of one provider are found and how one is brought in.
 * Whether an import is forked, so the original is left untouched, is
 * decided by `AGENT_CAPABILITIES[provider].forksImports`; `fork` is how.
 */
export type ImportSource = {
  /** Recent sessions you worked in, in any order. */
  list: () => Promise<Array<ImportableSession>>;
  /**
   * The conversation as mothership messages and events, in order. Sub-agent
   * internals are left out; tool outputs are cut like live ones.
   *
   * @throws Error When the session cannot be found or read.
   */
  history: (sessionId: string) => Promise<Array<HistoryItem>>;
  /** How a provider that `forksImports` copies a session; `undefined` for one that continues the session itself. */
  fork: ImportFork | undefined;
};

/**
 * ### ImportFork
 *
 * Making and deleting the copy of a session an import continues.
 */
export type ImportFork = {
  /** Makes the copy now. @returns The copy's provider session id. */
  make: (session: ImportableSession) => Promise<string>;
  /** Deletes a copy `make` made, when the import fails. */
  discard: (sessionRef: string) => Promise<void>;
};

const IMPORT_SOURCES: Record<ImportProvider, ImportSource> = { claude: claudeImport, codex: codexImport };

/** The fork an import of `provider` makes, or `undefined` when it continues the session itself. */
function forkOf(provider: ImportProvider): ImportFork | undefined {
  if (!AGENT_CAPABILITIES[provider].forksImports) return undefined;
  const fork = IMPORT_SOURCES[provider].fork;
  if (fork === undefined) throw new Error(`${provider} imports are meant to fork, but its import source cannot`);
  return fork;
}

/**
 * ### listImportable
 *
 * @returns Recent local sessions of `provider`, newest first.
 */
export async function listImportable(provider: ImportProvider): Promise<Array<ImportableSession>> {
  const sessions = await IMPORT_SOURCES[provider].list();
  return sessions.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * ### ImportSteps
 *
 * How an import reads a session and copies it; {@link importSteps} gives
 * the real ones for a provider.
 */
export type ImportSteps = {
  history: ImportSource["history"];
  /** `undefined` when the provider continues the session itself. */
  fork: ImportFork | undefined;
};

/**
 * ### importSteps
 *
 * @returns The steps that import a session of `provider`: a fork when it
 *   `forksImports`.
 */
export function importSteps(provider: ImportProvider): ImportSteps {
  return { history: IMPORT_SOURCES[provider].history, fork: forkOf(provider) };
}

/**
 * ### importSession
 *
 * Reads a listed session's conversation, makes the provider conversation
 * mothership will continue (a fork, or the session itself), and hands both
 * to `insert`. When `insert` fails, the fork is deleted again so no copy is
 * left behind; the original is never touched.
 *
 * @param insert - Takes the session into mothership, e.g. the runtime's `importSession`.
 * @returns What `insert` returned.
 * @throws Error When the session cannot be read or forked, or `insert`'s own error.
 */
export async function importSession<T>(
  session: ImportableSession,
  insert: (history: Array<HistoryItem>, sessionRef: string) => Promise<T>,
  steps: ImportSteps = importSteps(session.provider),
): Promise<T> {
  const history = await steps.history(session.id);
  const sessionRef = steps.fork === undefined ? session.id : await steps.fork.make(session);
  try {
    return await insert(history, sessionRef);
  } catch (error) {
    // The import's own error is the one worth reporting, not a failed cleanup.
    await steps.fork?.discard(sessionRef).catch(() => undefined);
    throw error;
  }
}
