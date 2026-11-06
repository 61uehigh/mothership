"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useShell } from "@/shell/ShellContext";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { teamOf, type NativeSubagent } from "@/features/sessions/ui/team";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";

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
                agent.id === activeId ? "bg-teal-100/70 dark:bg-teal-900/40" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
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
                        <MessageCircleQuestion size={11} aria-hidden /> Needs you
                      </span>
                    ) : (
                      <StatusLabel agent={agent} turns={agent.sessionRef === undefined ? 0 : 1} queued={0} waiting={false} />
                    )}
                  </span>
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {[agent.role, agent.model ?? agent.provider, agent.worktree?.state === "active" ? agent.worktree.branch : undefined]
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
            <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md py-1 pr-2 pl-1 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70">
              <span className="mt-0.5 shrink-0 font-mono text-zinc-400" aria-hidden>
                ↳
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{sub.description}</span>
                  <span className={`ml-auto shrink-0 text-[11px] ${NATIVE_STATUS[sub.status].className}`}>{NATIVE_STATUS[sub.status].label}</span>
                </span>
                <span className="truncate text-[11px] text-zinc-500">
                  {["Claude sub-agent", sub.kind, sub.model, sub.steps > 0 ? `${sub.steps} ${sub.steps === 1 ? "step" : "steps"}` : undefined]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {sub.lastTool !== undefined && <span className="truncate text-[11px] italic text-zinc-600 dark:text-zinc-300">Using {sub.lastTool}</span>}
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

const NATIVE_STATUS: Record<NativeSubagent["status"], { label: string; className: string }> = {
  running: { label: "Working", className: "text-teal-600 dark:text-teal-400" },
  done: { label: "Done", className: "text-green-600 dark:text-green-400" },
  failed: { label: "Did not finish", className: "text-red-600 dark:text-red-400" },
};
