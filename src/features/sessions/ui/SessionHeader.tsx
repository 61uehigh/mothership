"use client";

import { GitBranch, Network, Square, FileDiff } from "lucide-react";
import { formatBinding } from "@/shell/commands/keys";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { agentModelLabel, stopTurn } from "@/features/sessions/ui/sessionActions";
import { useT } from "@/ui/i18n/useT";

/**
 * ### SessionHeader
 *
 * The session tab's top bar: name, status, provider and model, worktree
 * branch, and buttons for the team graph, the worktree's changes, and
 * stopping a running turn.
 */
export function SessionHeader({
  agent,
  turns,
  queued,
  waiting,
  teamSize,
  working,
}: {
  agent: Agent;
  /** Messages delivered so far. */
  turns: number;
  /** Messages waiting to be delivered. */
  queued: number;
  /** The session has an open question for you. */
  waiting: boolean;
  /** Sub-agents in the session's team, its own and Claude's native ones; the Team button shows when there are any. */
  teamSize: number;
  /** How many of those are running. */
  working: number;
}) {
  const t = useT();
  const workbench = useWorkbenchActions();
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <h2 className="truncate font-semibold">{agent.name}</h2>
      <StatusLabel agent={agent} turns={turns} queued={queued} waiting={waiting} />
      <span className="font-mono text-[11px] text-zinc-500">{agentModelLabel(agent)}</span>
      {agent.worktree !== undefined && (
        <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-500" title={agent.worktree.path}>
          <GitBranch size={12} aria-hidden /> {agent.worktree.branch}
        </span>
      )}
      <span className="ml-auto flex gap-1">
        {teamSize > 0 && (
          <button
            type="button"
            title={t("sessions.header.teamTitle")}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => workbench.open({ kind: "graph" })}
          >
            <Network size={13} aria-hidden /> {t("sessions.header.team", { count: teamSize })}
            {working > 0 && <span className="text-teal-600 dark:text-teal-400">{t("sessions.header.teamWorking", { count: working })}</span>}
          </button>
        )}
        {agent.worktree !== undefined && (
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            onClick={() => workbench.open({ kind: "changes", agentId: agent.id })}
          >
            <FileDiff size={13} aria-hidden /> {t("sessions.header.changes")}
          </button>
        )}
        {agent.status === "running" && (
          <button
            type="button"
            title={formatBinding("mod+.")}
            className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => stopTurn(agent.id, t)}
          >
            <Square size={11} aria-hidden /> {t("sessions.header.stop")}
          </button>
        )}
      </span>
    </header>
  );
}
