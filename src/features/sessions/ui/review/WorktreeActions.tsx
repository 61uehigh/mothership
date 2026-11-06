"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/ui/Modal";
import type { Agent } from "@/features/sessions/model/Agent";
import { fetchJson, fetchText } from "@/ui/useJson";

const BUTTON = "rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-40";

/**
 * ### MergeDialog
 *
 * Confirms merging an agent's worktree into the user's repository, with an
 * editable commit message for its uncommitted work. In a comparison group it
 * warns that the other attempts will be discarded.
 */
export function MergeDialog({
  agent,
  fileCount,
  onDone,
  onClose,
}: {
  agent: Agent & { worktree: NonNullable<Agent["worktree"]> };
  fileCount: number | undefined;
  onDone: (commit: string) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(`${agent.name}: apply agent work`);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function merge() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await fetchJson<{ commit: string }>(`/api/agents/${agent.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (result.ok) onDone(result.data.commit);
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Confirm title="Merge changes" onClose={onClose}>
      <p className="text-sm">
        Merge <code className="text-xs">{agent.worktree.branch}</code> into <strong>{agent.worktree.baseBranch}</strong> in{" "}
        <code className="text-xs">{agent.worktree.repo}</code>{fileCount === undefined ? "" : ` (${fileCount} ${fileCount === 1 ? "file" : "files"})`}.
      </p>
      {agent.compareGroup !== undefined && (
        <p className="text-sm text-amber-700 dark:text-amber-400">All other attempts in this compare group will be discarded.</p>
      )}
      <label className="flex flex-col gap-1 text-xs text-zinc-500">
        Commit message
        <input
          data-autofocus
          className="rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {error !== undefined && <p className="whitespace-pre-wrap text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || message.trim() === ""}
          className={`${BUTTON} bg-teal-600 text-white`}
          onClick={() => void merge()}
        >
          {busy ? "Merging…" : "Merge"}
        </button>
      </div>
    </Confirm>
  );
}

/**
 * ### DiscardDialog
 *
 * Confirms deleting an agent's worktree and branch, including unmerged work.
 */
export function DiscardDialog({ agent, onDone, onClose }: { agent: Agent; onDone: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function discard() {
    setBusy(true);
    try {
      const result = await fetchText(`/api/agents/${agent.id}/discard`, { method: "POST" });
      if (result.ok) onDone();
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Confirm title="Discard changes" onClose={onClose}>
      <p className="text-sm">
        Deletes the worktree and branch for &ldquo;{agent.name}&rdquo;. Unmerged changes cannot be recovered.
      </p>
      {error !== undefined && <p className="whitespace-pre-wrap text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={BUTTON} data-autofocus onClick={onClose}>
          Cancel
        </button>
        <button type="button" disabled={busy} className={`${BUTTON} bg-red-600 text-white`} onClick={() => void discard()}>
          {busy ? "Discarding…" : "Discard"}
        </button>
      </div>
    </Confirm>
  );
}

function Confirm({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal label={title} onClose={onClose}>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <h2 className="font-semibold">{title}</h2>
        {children}
      </div>
    </Modal>
  );
}
