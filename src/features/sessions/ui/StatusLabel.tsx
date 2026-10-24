"use client";

import type { Agent } from "@/features/sessions/model/Agent";

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
  const [dot, label] =
    waiting && agent.status !== "running"
      ? ["bg-amber-500 animate-pulse", "Needs you"]
      : agent.status === "running"
      ? ["bg-teal-400 animate-pulse", "Working"]
      : agent.status === "failed"
        ? ["bg-red-500", "Failed"]
        : agent.status === "interrupted"
          ? ["bg-amber-400", "Stopped"]
          : turns === 0
            ? ["bg-zinc-500", "Idle"]
            : ["bg-green-500", "Done"];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
      {queued > 0 && <span className="text-zinc-500">· {queued} queued</span>}
    </span>
  );
}
