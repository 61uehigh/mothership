"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import type { Agent } from "@/features/sessions/model/Agent";
import { sessionsToContinue } from "@/features/sessions/model/Restart";
import { useT } from "@/ui/i18n/useT";
import { fetchJson, jsonRequest } from "@/ui/useJson";
import { reportFailure } from "@/ui/notices";

/**
 * ### RestartNotice
 *
 * Above the composer of a session whose work a restart cut off (its own turn,
 * or its sub-agents'): says so, and Continue picks the work up again where it
 * stopped. Hidden when nothing in the team was stopped by a restart.
 *
 * @param agents - Every session, to find the team's.
 */
export function RestartNotice({ agent, agents }: { agent: Agent; agents: ReadonlyArray<Agent> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const stopped = sessionsToContinue(agent.id, agents);
  if (stopped.length === 0) return null;
  const subAgents = stopped.filter((id) => id !== agent.id).length;
  const what =
    subAgents === 0
      ? t("sessions.restart.self")
      : stopped.includes(agent.id)
        ? subAgents === 1
          ? t("sessions.restart.selfAndSub.one")
          : t("sessions.restart.selfAndSub.other", { count: subAgents })
        : subAgents === 1
          ? t("sessions.restart.sub.one")
          : t("sessions.restart.sub.other", { count: subAgents });

  async function continueWork() {
    setBusy(true);
    try {
      reportFailure(t("sessions.restart.failed"), await fetchJson(`/api/agents/${agent.id}/continue`, jsonRequest("POST", {})));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="flex shrink-0 items-center gap-3 border-t border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="min-w-0 flex-1">
        <span className="font-medium">{t("sessions.restart.reason")}</span> {what}
      </p>
      <button
        type="button"
        disabled={busy}
        className="flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        onClick={() => void continueWork()}
      >
        <RotateCw size={12} aria-hidden /> {busy ? t("sessions.restart.continuing") : t("sessions.restart.continue")}
      </button>
    </div>
  );
}
