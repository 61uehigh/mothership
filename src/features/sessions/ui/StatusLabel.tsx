"use client";

import { LoaderCircle } from "lucide-react";
import type { Agent } from "@/features/sessions/model/Agent";
import { statusKey, type StatusKey } from "@/features/sessions/model/statusKey";
import { useT } from "@/ui/i18n/useT";

const DOT: Record<Exclude<StatusKey, "working">, string> = {
  needsYou: "bg-amber-500 animate-pulse",
  failed: "bg-red-500",
  stoppedByRestart: "bg-amber-400",
  stopped: "bg-amber-400",
  idle: "bg-zinc-500",
  done: "bg-green-500",
};

/**
 * ### StatusLabel
 *
 * Status dot and label. `turns` distinguishes a fresh agent from one
 * that has answered; `waiting` marks an agent with an open question to the human.
 */
export function StatusLabel({
  agent,
  turns,
  queued,
  waiting,
}: {
  agent: Agent;
  turns: number;
  queued: number;
  waiting: boolean;
}) {
  const t = useT();
  const key = statusKey(agent, { answered: turns > 0, waiting });
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300"
      title={agent.status === "interrupted" && agent.stoppedByRestart ? t("sessions.status.restartTitle") : undefined}
    >
      {key === "working" ? (
        <LoaderCircle size={10} aria-hidden className="animate-spin text-teal-500 dark:text-teal-400" />
      ) : (
        <span className={`size-1.5 rounded-full ${DOT[key]}`} />
      )}
      {t(`sessions.status.${key}`)}
      {queued > 0 && <span className="text-zinc-500">{t("sessions.status.queued", { count: queued })}</span>}
    </span>
  );
}
