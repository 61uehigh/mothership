"use client";

import type { Agent } from "@/features/sessions/model/Agent";
import { relativeTime } from "@/ui/format";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import type { AgentKind } from "@/features/sessions/model/AgentEvents";

/**
 * ### CARD_WIDTH
 *
 * Card size in pixels; the graph layout depends on it.
 */
export const CARD_WIDTH = 248;

/**
 * ### CARD_HEIGHT
 *
 * See {@link CARD_WIDTH}.
 */
export const CARD_HEIGHT = 112;

const TAG =
  "shrink-0 max-w-full truncate rounded border border-zinc-200 px-1.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400";

const PROVIDER_ACCENT: Record<AgentKind, string> = {
  claude: "border-l-orange-400",
  codex: "border-l-sky-400",
  openai: "border-l-emerald-400",
};

/**
 * ### AgentCard
 *
 * One graph node. Positioned by the parent; this component only renders content.
 */
export function AgentCard({
  agent,
  turns,
  queued,
  waiting,
  now,
  onSelect,
}: {
  agent: Agent;
  turns: number;
  queued: number;
  waiting: boolean;
  now: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className={`flex flex-col gap-1 overflow-hidden rounded-lg border border-l-4 bg-white p-2.5 text-left shadow-sm transition-colors dark:bg-zinc-900 ${PROVIDER_ACCENT[agent.provider]} border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500`}
    >
      <span className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">{agent.name}</span>
      <StatusLabel agent={agent} turns={turns} queued={queued} waiting={waiting} />
      <span className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        {[agent.model ?? agent.provider, agent.effort, relativeTime(agent.lastActivityAt, now)]
          .filter((part) => part !== undefined)
          .join(" · ")}
      </span>
      <span className="truncate text-[11px] italic text-zinc-600 dark:text-zinc-300" title={agent.statusNote}>
        {agent.statusNote ?? " "}
      </span>
      <span className="flex min-w-0 gap-1 overflow-hidden">
        {agent.worktree !== undefined && (
          <span className={TAG} title={agent.worktree.branch}>
            ⎇ {{ active: "worktree", merged: "Merged", discarded: "Discarded" }[agent.worktree.state]}
          </span>
        )}
        {agent.role !== undefined && <span className={TAG}>role: {agent.role}</span>}
        {agent.links.slice(0, 2).map((link) => (
          <span key={link.url} className={`${TAG} text-sky-600 dark:text-sky-400`} title={link.url}>
            {link.label}
          </span>
        ))}
        {agent.links.length > 2 && <span className={TAG}>+{agent.links.length - 2}</span>}
      </span>
    </button>
  );
}
