"use client";

import { FolderGit2, Lock, Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@/ui/format";
import { Modal } from "@/ui/Modal";
import { fetchJson, useJson } from "@/ui/useJson";
import type { AccountRepo, GhErrorCode, RepoList } from "@/features/github/model/GitHub";

const LIST_SHOWN = 50;

/**
 * ### ManageReposDialog
 *
 * Chooses which repositories the GitHub section offers: remove ones from the
 * list (a local checkout stays on disk and can be restored), or add any
 * repository from your GitHub account or organizations, with or without a
 * local checkout.
 *
 * @param list - The current list, from `/api/github/repos`.
 * @param onChanged - Called with the updated list after each change.
 */
export function ManageReposDialog({ list, onChanged, onClose }: { list: RepoList; onChanged: () => void; onClose: () => void }) {
  const account = useJson<{ repos: Array<AccountRepo> }, GhErrorCode>("/api/github/account-repos");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function change(action: "add" | "remove" | "restore", repo: string) {
    setBusy(repo);
    try {
      const result = await fetchJson<RepoList>("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, repo }),
      });
      if (!result.ok) throw new Error(result.error);
      setError(undefined);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(undefined);
    }
  }

  const shown = new Set(list.repos.map((r) => r.repo));
  const query = filter.trim().toLowerCase();
  const addable = (account.data?.repos ?? []).filter(
    (r) => !shown.has(r.repo) && (query === "" || r.repo.toLowerCase().includes(query) || (r.description ?? "").toLowerCase().includes(query)),
  );
  const iconButton = "rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

  return (
    <Modal label="GitHub repositories" onClose={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-xl bg-white p-5 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">GitHub repositories</h2>

        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-zinc-500">In the list</h3>
          {list.repos.length === 0 && <p className="text-xs text-zinc-500">None yet. Add one below.</p>}
          <ul className="flex max-h-48 flex-col overflow-y-auto">
            {list.repos.map((r) => (
              <li key={r.repo} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                <FolderGit2 size={14} className="shrink-0 text-zinc-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{r.repo}</span>
                <span className="max-w-40 shrink-0 truncate text-[11px] text-zinc-500" title={r.dir}>
                  {r.source === "added" ? "From your account" : r.dir}
                </span>
                <button type="button" aria-label={`Remove ${r.repo}`} title="Remove from the list" disabled={busy !== undefined} className={iconButton} onClick={() => void change("remove", r.repo)}>
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {list.hidden.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-xs font-medium text-zinc-500">Removed local repositories</h3>
            <ul className="flex flex-col">
              {list.hidden.map((repo) => (
                <li key={repo} className="flex items-center gap-2 px-1 py-1 text-sm text-zinc-500">
                  <span className="min-w-0 flex-1 truncate">{repo}</span>
                  <button type="button" disabled={busy !== undefined} className={`${iconButton} flex items-center gap-1 text-xs`} onClick={() => void change("restore", repo)}>
                    <RotateCcw size={12} aria-hidden /> Restore
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex min-h-0 flex-1 flex-col gap-1.5">
          <h3 className="text-xs font-medium text-zinc-500">Add from your GitHub account</h3>
          <input
            data-autofocus
            className="w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700"
            placeholder="Filter by name or description"
            aria-label="Filter your repositories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {account.error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{account.error}</p>}
          {account.data === undefined && account.error === undefined && <p className="text-xs text-zinc-500">Loading your repositories…</p>}
          <ul className="flex min-h-0 flex-col overflow-y-auto">
            {addable.slice(0, LIST_SHOWN).map((r) => (
              <li key={r.repo}>
                <button
                  type="button"
                  disabled={busy !== undefined}
                  onClick={() => void change("add", r.repo)}
                  className="flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-zinc-100 disabled:opacity-60 dark:hover:bg-zinc-800/60"
                >
                  <Plus size={14} className="mt-0.5 shrink-0 text-teal-600" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1 truncate text-sm">
                      {r.repo}
                      {r.isPrivate && <Lock size={11} className="shrink-0 text-zinc-500" aria-label="Private" />}
                    </span>
                    {r.description !== undefined && <span className="truncate text-[11px] text-zinc-500">{r.description}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {addable.length > LIST_SHOWN && <p className="text-[11px] text-zinc-500">Showing {LIST_SHOWN} of {addable.length}. Type to narrow down.</p>}
        </section>

        {error !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end">
          <button type="button" className="rounded-md px-4 py-1.5 text-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
