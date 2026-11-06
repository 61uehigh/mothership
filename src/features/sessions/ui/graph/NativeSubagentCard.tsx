"use client";

import { CARD_HEIGHT, CARD_WIDTH } from "@/features/sessions/ui/graph/AgentCard";
import type { NativeSubagent } from "@/features/sessions/model/Subagents";

const STATUS: Record<NativeSubagent["status"], { label: string; dot: string }> = {
  running: { label: "Working", dot: "bg-teal-400 animate-pulse" },
  done: { label: "Done", dot: "bg-green-500" },
  failed: { label: "Did not finish", dot: "bg-red-500" },
};

/**
 * ### NativeSubagentCard
 *
 * A graph node for a sub-agent the provider ran on its own (Claude's Agent
 * tool): dashed and read-only, since mothership did not create it and cannot
 * message it. Shows its task, type, progress, and the start of its report;
 * a click opens the session that ran it.
 */
export function NativeSubagentCard({ sub, onSelect }: { sub: NativeSubagent; onSelect: () => void }) {
  const status = STATUS[sub.status];
  return (
    <button
      type="button"
      onClick={onSelect}
      title={sub.output === undefined ? sub.description : `${sub.description}\n\n${sub.output}`}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className="flex flex-col gap-1 overflow-hidden rounded-lg border border-dashed border-l-4 border-zinc-300 border-l-orange-300 bg-zinc-50 p-2.5 text-left transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:border-l-orange-400/60 dark:bg-zinc-900/60 dark:hover:border-zinc-500"
    >
      <span className="truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">{sub.description}</span>
      <span className="truncate font-mono text-[10px] text-zinc-500">
        {["Claude sub-agent", sub.kind, sub.model].filter(Boolean).join(" · ")}
      </span>
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
        <span className={`size-1.5 rounded-full ${status.dot}`} />
        {status.label}
        {sub.steps > 0 && <span className="text-zinc-500">· {sub.steps} {sub.steps === 1 ? "step" : "steps"}</span>}
      </span>
      <span className="line-clamp-2 text-[11px] text-zinc-500">
        {sub.status === "running" ? (sub.lastTool === undefined ? "Starting…" : `Using ${sub.lastTool}`) : (sub.output ?? "")}
      </span>
    </button>
  );
}
