"use client";

import { Download, GitBranch, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import { Modal } from "@/ui/Modal";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { fetchJson, jsonRequest, useJson, type ApiFailure } from "@/ui/useJson";
import type { Translate } from "@/ui/i18n/translate";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { useNow } from "@/ui/useNow";
import type { Agent } from "@/features/sessions/model/Agent";
import { AGENT_CAPABILITIES } from "@/features/sessions/model/AgentEvents";
import { IMPORT_PROVIDERS, IMPORT_SOURCE_LABELS, type ImportableSession, type ImportProvider } from "@/features/sessions/model/Import";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import type { ImportErrorCode } from "@/lib/apiErrorCodes";

const CLOCK_TICK_MS = 60_000;

function importFailure(t: Translate, failure: ApiFailure<ImportErrorCode>, source: string, folder?: string): string {
  switch (failure.code) {
    case "list-failed":
      return t("sessions.import.listFailed", { source, reason: failure.error });
    case "not-recent":
      return t("sessions.import.notRecent");
    case "folder-gone":
      return t("sessions.import.folderGone", { folder: folder ?? "" });
    case "already-imported":
      return t("sessions.import.alreadyImported", { source });
    case "import-failed":
      return t("sessions.import.importFailed", { reason: failure.error });
    case undefined:
      return failure.error;
  }
}

/**
 * ### ImportSessionDialog
 *
 * Picks a recent Claude Code or Codex session from this Mac and imports it as
 * a lead session. Where the provider can fork, the original stays as it is;
 * otherwise the same thread continues. The earlier conversation shows
 * as history and the next message continues it in mothership.
 *
 * @param onImported - Called with the new session.
 */
export function ImportSessionDialog({ onImported, onClose }: { onImported: (agent: Agent) => void; onClose: () => void }) {
  const t = useT();
  const { relativeTime } = useFormat();
  const now = useNow(CLOCK_TICK_MS);
  const [provider, setProvider] = useState<ImportProvider>("claude");
  const [filter, setFilter] = useState("");
  const [importing, setImporting] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const list = useJson<{ sessions: Array<ImportableSession> }, ImportErrorCode>(`/api/import?provider=${provider}`);
  const source = IMPORT_SOURCE_LABELS[provider];

  const query = filter.trim().toLowerCase();
  const sessions = (list.data?.sessions ?? []).filter(
    (s) => query === "" || s.title.toLowerCase().includes(query) || (s.cwd ?? "").toLowerCase().includes(query),
  );

  async function importSession(session: ImportableSession) {
    setImporting(session.id);
    const result = await fetchJson<Agent, ImportErrorCode>("/api/import", jsonRequest("POST", { provider: session.provider, id: session.id }));
    setImporting(undefined);
    if (result.ok) onImported(result.data);
    else setError(importFailure(t, result, source, session.cwd));
  }

  return (
    <Modal label={t("sessions.common.importSession")} dismissible={importing === undefined} onClose={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-hidden rounded-xl bg-white p-5 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">{t("sessions.common.importSession")}</h2>
        <p className="text-xs text-zinc-500">
          {AGENT_CAPABILITIES[provider].forksImports ? t("sessions.import.forkNote", { source }) : t("sessions.import.sameThreadNote", { source })}
        </p>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label={t("sessions.import.from")}
            value={provider}
            options={IMPORT_PROVIDERS.map((value) => ({ value, label: IMPORT_SOURCE_LABELS[value] }))}
            onChange={(next) => {
              setProvider(next);
              setError(undefined);
            }}
            className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800"
            optionClassName={(selected) => `rounded px-2.5 py-1 ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
          />
          <input
            data-autofocus
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700"
            placeholder={t("sessions.import.filterPlaceholder")}
            aria-label={t("sessions.common.filterSessions")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {list.failure !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{importFailure(t, list.failure, source)}</p>}
        {list.data === undefined && list.failure === undefined && <p className="text-xs text-zinc-500">{t("sessions.import.looking")}</p>}
        {list.data !== undefined && sessions.length === 0 && <p className="text-xs text-zinc-500">{t("sessions.import.none")}</p>}

        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={importing !== undefined}
                onClick={() => void importSession(s)}
                className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800/60"
              >
                {importing === s.id ? (
                  <LoaderCircle size={15} className="mt-0.5 shrink-0 animate-spin text-teal-600" aria-hidden />
                ) : (
                  <Download size={15} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm">{itemTitle(t, s.title)}</span>
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-zinc-500">
                    <span className="min-w-0 truncate font-mono" title={s.cwd}>
                      {s.cwd ?? t("sessions.import.unknownFolder")}
                    </span>
                    {s.branch !== undefined && s.branch !== "HEAD" && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <GitBranch size={10} aria-hidden /> {s.branch}
                      </span>
                    )}
                    {now > 0 && <span className="ml-auto shrink-0 whitespace-nowrap">{relativeTime(s.lastModified, now)}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {error !== undefined && <p className="text-xs break-words text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end">
          <button type="button" disabled={importing !== undefined} className="rounded-md px-4 py-1.5 text-sm disabled:opacity-40" onClick={onClose}>
            {t("ui.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
