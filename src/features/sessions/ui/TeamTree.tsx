"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useShell } from "@/shell/shellContext";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { teamOf, type NativeSubagent } from "@/features/sessions/ui/team";
import { useWorkbench } from "@/shell/workbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";
import { leadLabel } from "@/features/sessions/model/Lead";
import { SELECTED_ROW, ROW_HOVER } from "@/ui/selection";
import { useT } from "@/ui/i18n/useT";

/**
 * ### TeamTree
 *
 * The sub-agents a lead created to get its work done, as a tree: who each
 * one is (role, model), what it is doing now, and whether it needs you.
 * The lead decides whom to create; this only shows them. A click opens that
 * agent's conversation.
 *
 * Sub-agents the lead's provider ran on its own (`native`, e.g. Claude's
 * Agent tool) are listed after them, read-only: what each was asked, what it
 * is doing, and its report.
 *
 * @param lead - The session whose team to show; nothing renders without a team.
 * @param native - The lead's own sub-agents, read from its events.
 */
export function TeamTree({ lead, native = [] }: { lead: Agent; native?: Array<NativeSubagent> }) {
  const t = useT();
  const { agents, questions } = useShell();
  const workbench = useWorkbench();
  const team = teamOf(lead, agents);
  if (team.length === 0 && native.length === 0) return undefined;
  const activeId = workbench.active?.tab.kind === "session" ? workbench.active.tab.agentId : undefined;

  return (
    <ul className="flex flex-col">
      {team.map(({ agent, depth }) => {
        const waiting = questions.some((q) => q.agentId === agent.id && q.status === "open");
        return (
          <li key={agent.id}>
            <button
              type="button"
              onClick={() => workbench.open({ kind: "session", agentId: agent.id }, { preview: true })}
              className={`flex w-full items-start gap-2 rounded-md py-1 pr-2 text-left text-xs ${
                agent.id === activeId ? SELECTED_ROW : ROW_HOVER
              }`}
              style={{ paddingLeft: 4 + (depth - 1) * 14 }}
            >
              <span className="mt-0.5 shrink-0 font-mono text-zinc-400" aria-hidden>
                ↳
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{agent.name}</span>
                  <span className="ml-auto shrink-0">
                    {waiting ? (
                      <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                        <MessageCircleQuestion size={11} aria-hidden /> {t("sessions.status.needsYou")}
                      </span>
                    ) : (
                      <StatusLabel agent={agent} turns={agent.sessionRef === undefined ? 0 : 1} queued={0} waiting={false} />
                    )}
                  </span>
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {[agent.role, leadLabel(agent), agent.worktree?.state === "active" ? agent.worktree.branch : undefined]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {agent.statusNote !== undefined && <span className="truncate text-[11px] italic text-zinc-600 dark:text-zinc-300">{agent.statusNote}</span>}
              </span>
            </button>
          </li>
        );
      })}
      {native.map((sub) => (
        <li key={sub.id}>
          <details className="group rounded-md text-xs">
            <summary className={`flex cursor-pointer list-none items-start gap-2 rounded-md py-1 pr-2 pl-1 ${ROW_HOVER}`}>
              <span className="mt-0.5 shrink-0 font-mono text-zinc-400" aria-hidden>
                ↳
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{sub.description}</span>
                  <span className={`ml-auto shrink-0 text-[11px] ${NATIVE_STATUS[sub.status].className}`}>{t(NATIVE_STATUS[sub.status].label)}</span>
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {[
                    t("sessions.common.claudeSubagent"),
                    sub.kind,
                    sub.model,
                    sub.steps === 0 ? undefined : sub.steps === 1 ? t("sessions.common.steps.one", { count: 1 }) : t("sessions.common.steps.other", { count: sub.steps }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {sub.lastTool !== undefined && <span className="truncate text-[11px] italic text-zinc-600 dark:text-zinc-300">{t("sessions.common.using", { tool: sub.lastTool })}</span>}
              </span>
            </summary>
            {sub.output !== undefined && sub.output !== "" && (
              <p className="mt-1 mb-2 ml-6 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border border-zinc-200 p-2 text-[11px] text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                {sub.output}
              </p>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}

const NATIVE_STATUS = {
  running: { label: "sessions.status.working", className: "text-teal-600 dark:text-teal-400" },
  done: { label: "sessions.status.done", className: "text-green-600 dark:text-green-400" },
  failed: { label: "sessions.common.didNotFinish", className: "text-red-600 dark:text-red-400" },
} as const satisfies Record<NativeSubagent["status"], { label: string; className: string }>;
