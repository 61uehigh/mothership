"use client";

import { Download, GitBranch, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { errorMessage, relativeTime } from "@/ui/format";
import { Modal } from "@/ui/Modal";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { fetchJson, useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import type { Agent } from "@/features/sessions/model/Agent";
import type { ImportableSession, ImportProvider } from "@/features/sessions/model/Import";

const CLOCK_TICK_MS = 60_000;

/**
 * ### ImportSessionDialog
 *
 * Picks a recent Claude Code or Codex session from this Mac and imports it as
 * a lead session. A Claude session is forked, so the original stays as it is;
 * a Codex session continues the same thread. The earlier conversation shows
 * as history and the next message continues it in mothership.
 *
 * @param onImported - Called with the new session.
 */
export function ImportSessionDialog({ onImported, onClose }: { onImported: (agent: Agent) => void; onClose: () => void }) {
  const now = useNow(CLOCK_TICK_MS);
  const [provider, setProvider] = useState<ImportProvider>("claude");
  const [filter, setFilter] = useState("");
  const [importing, setImporting] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const list = useJson<{ sessions: Array<ImportableSession> }>(`/api/import?provider=${provider}`);

  const query = filter.trim().toLowerCase();
  const sessions = (list.data?.sessions ?? []).filter(
    (s) => query === "" || s.title.toLowerCase().includes(query) || (s.cwd ?? "").toLowerCase().includes(query),
  );

  async function importSession(session: ImportableSession) {
    setImporting(session.id);
    try {
      const result = await fetchJson<Agent>("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: session.provider, id: session.id }),
      });
      if (!result.ok) throw new Error(result.error);
      onImported(result.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setImporting(undefined);
    }
  }

  return (
    <Modal label="Import a session" onClose={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-hidden rounded-xl bg-white p-5 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Import a session</h2>
        <p className="text-xs text-zinc-500">
          {provider === "claude"
            ? "Continue a Claude Code session here. mothership works on a copy (fork), so the original stays as it is in Claude Code."
            : "Continue a Codex session here. Codex cannot fork, so mothership continues the same thread: don't use it in Codex at the same time."}
        </p>
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Import from"
            value={provider}
            options={[
              { value: "claude", label: "Claude Code" },
              { value: "codex", label: "Codex" },
            ]}
            onChange={(next) => {
              setProvider(next);
              setError(undefined);
            }}
            className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800"
            optionClassName={(selected) => `rounded px-2.5 py-1 ${selected ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
          />
          <input
            data-autofocus
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700"
            placeholder="Filter by title or folder"
            aria-label="Filter sessions"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {list.error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{list.error}</p>}
        {list.data === undefined && list.error === undefined && <p className="text-xs text-zinc-500">Looking for sessions…</p>}
        {list.data !== undefined && sessions.length === 0 && <p className="text-xs text-zinc-500">No sessions found.</p>}

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
                  <span className="truncate text-sm">{s.title}</span>
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-zinc-500">
                    <span className="min-w-0 truncate font-mono" title={s.cwd}>
                      {s.cwd ?? "Unknown folder"}
                    </span>
                    {s.branch !== undefined && s.branch !== "HEAD" && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <GitBranch size={10} aria-hidden /> {s.branch}
                      </span>
                    )}
                    {now > 0 && <span className="ml-auto shrink-0">{relativeTime(s.lastModified, now)}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {error !== undefined && <p className="text-xs break-words text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end">
          <button type="button" className="rounded-md px-4 py-1.5 text-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
