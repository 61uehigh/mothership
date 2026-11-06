"use client";

import { useState } from "react";
import { Modal } from "@/ui/Modal";
import type { Agent } from "@/features/sessions/model/Agent";
import { AGENT_KIND_LABELS } from "@/features/sessions/model/AgentEvents";
import { fetchText, jsonRequest } from "@/ui/useJson";
import { reportFailure } from "@/ui/notices";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { richText } from "@/features/sessions/ui/richText";

/**
 * ### setArchived
 *
 * Archives or restores a session. A failure shows as a notice.
 */
export function setArchived(agentId: string, archived: boolean, t: Translate): void {
  void fetchText(`/api/agents/${agentId}/archive`, jsonRequest("POST", { archived })).then((result) =>
    reportFailure(archived ? t("sessions.action.archiveFailed") : t("sessions.action.restoreFailed"), result),
  );
}

/**
 * ### stopTurn
 *
 * Stops a session's running turn; the session stays and can be written to
 * again. A failure shows as a notice.
 */
export function stopTurn(agentId: string, t: Translate): void {
  void fetchText(`/api/agents/${agentId}/stop`, { method: "POST" }).then((result) => reportFailure(t("sessions.action.stopFailed"), result));
}

/**
 * ### agentModelLabel
 *
 * @returns The backend, model, and effort a session runs with, e.g. `Claude · opus · high` or `Codex · gpt-6.2-sol`.
 * @param defaultModel - Shown when the session uses the backend's default model; left out when not given.
 */
export function agentModelLabel(agent: Pick<Agent, "provider" | "model" | "effort">, defaultModel?: string): string {
  return [AGENT_KIND_LABELS[agent.provider], agent.model ?? defaultModel, agent.effort].filter(Boolean).join(" · ");
}

/**
 * ### DeleteSessionDialog
 *
 * Confirms permanently deleting a session. Warns when it has a worktree with
 * unmerged work, which is discarded with it.
 */
export function DeleteSessionDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useT();
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await fetchText(`/api/agents/${agent.id}`, { method: "DELETE" });
      if (result.ok) onClose();
      else setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={t("sessions.delete.title")} dismissible={!busy} onClose={onClose}>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
        <h2 className="font-semibold">{t("sessions.delete.title")}</h2>
        <p className="text-sm">
          {t("sessions.delete.body", { name: agent.name })}
          {agent.status === "running" && t("sessions.delete.stopFirst")}
        </p>
        {agent.worktree?.state === "active" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {richText(t("sessions.delete.worktree", { branch: "{branch}" }), { branch: <code className="text-xs">{agent.worktree.branch}</code> })}
          </p>
        )}
        <p className="text-xs text-zinc-500">{t("sessions.delete.archiveHint")}</p>
        {error !== undefined && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus disabled={busy} className="rounded-md px-4 py-1.5 text-sm disabled:opacity-40" onClick={onClose}>
            {t("ui.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || agent.status === "running"}
            className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            onClick={() => void remove()}
          >
            {busy ? t("sessions.common.deleting") : t("sessions.common.delete")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
