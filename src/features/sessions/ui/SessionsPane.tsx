"use client";

import { Archive, ArchiveRestore, Download, GitBranch, LoaderCircle, MessageCircleQuestion, Network, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useShell } from "@/shell/shellContext";
import { formatBinding } from "@/shell/commands/keys";
import { useNow } from "@/ui/useNow";
import { ImportSessionDialog } from "@/features/sessions/ui/ImportSessionDialog";
import { DeleteSessionDialog, setArchived } from "@/features/sessions/ui/sessionActions";
import { leadOf, teamOf } from "@/features/sessions/ui/team";
import { ICON_BUTTON, ROW_ACTION } from "@/ui/iconButtons";
import { GroupHeader } from "@/ui/GroupHeader";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/workbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";
import { leadLabel } from "@/features/sessions/model/Lead";
import { sessionsToContinue } from "@/features/sessions/model/Restart";
import { SELECTED_ROW, ROW_HOVER } from "@/ui/selection";
import { REVEAL_ON_HOVER } from "@/ui/hoverReveal";
import { useT } from "@/ui/i18n/useT";
import { useFormat } from "@/ui/i18n/format";
import { baseName } from "@/lib/filePaths";

const CLOCK_TICK_MS = 30_000;

const DOT: Record<Agent["status"], string> = {
  running: "bg-teal-400",
  idle: "bg-green-500",
  failed: "bg-red-500",
  interrupted: "bg-amber-400",
};

function repoName(agent: Agent): string {
  return baseName(agent.worktree?.repo ?? agent.workingDirectory);
}

/**
 * ### SessionsPane
 *
 * Left sidebar list of the sessions you started (leads), grouped by
 * repository, newest activity first. Sub-agents are created by their lead,
 * not by you, so they are not listed: each lead shows a one-line summary of
 * its team, and the team itself is in the lead's session. A click previews
 * the session; a double click pins its tab. Questions any agent asked through
 * `ask_human` sit on top under "Needs you", oldest first.
 */
export function SessionsPane() {
  const t = useT();
  const { relativeTime } = useFormat();
  const { agents, questions, openNewAgent } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // The id, not the agent, so the dialog follows the live session and closes once it is gone.
  const [deletingId, setDeletingId] = useState<string | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const deleting = deletingId === undefined ? undefined : agents.find((a) => a.id === deletingId);
  const live = useMemo(() => agents.filter((a) => a.archivedAt === undefined), [agents]);
  const archived = agents.filter((a) => a.archivedAt !== undefined).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  const openQuestions = useMemo(() => questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt - b.createdAt), [questions]);
  const waiting = new Set(openQuestions.map((q) => q.agentId));
  const activeQuestion = workbench.active?.tab.kind === "inbox" ? workbench.active.tab.questionId : undefined;
  const activeTabAgent = agents.find((a) => workbench.active?.tab.kind === "session" && a.id === workbench.active.tab.agentId);
  // Viewing a sub-agent highlights the lead it belongs to.
  const activeAgent = activeTabAgent === undefined ? undefined : leadOf(activeTabAgent, agents).id;

  const groups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const matches = (a: Agent) =>
      query === "" || [a.name, a.role, a.provider, a.model, a.worktree?.branch].some((v) => v?.toLowerCase().includes(query));
    // Leads are the agents at the top of their family; a lead's team is found by its name too.
    const roots = live.filter((a) => leadOf(a, agents).id === a.id);
    const byRepo = new Map<string, Array<Agent>>();
    for (const root of [...roots].sort((a, b) => b.lastActivityAt - a.lastActivityAt)) {
      const family = [root, ...teamOf(root, agents).map((m) => m.agent)];
      if (!family.some(matches)) continue;
      byRepo.set(repoName(root), [...(byRepo.get(repoName(root)) ?? []), root]);
    }
    return [...byRepo];
  }, [live, agents, filter]);

  function row(agent: Agent, depth: number) {
    const selected = agent.id === activeAgent;
    const team = teamOf(agent, agents).map((m) => m.agent);
    const teamWaiting = team.some((a) => waiting.has(a.id));
    const needsYou = waiting.has(agent.id) || teamWaiting;
    const working = team.filter((a) => a.status === "running").length;
    const teamCount = team.length === 1 ? t("sessions.pane.team.one") : t("sessions.pane.team.other", { count: team.length });
    const teamNote = team.length === 0 ? undefined : working > 0 ? t("sessions.pane.teamWorking", { team: teamCount, working }) : teamCount;
    const restartStopped = sessionsToContinue(agent.id, agents).length > 0;
    const detail = needsYou
      ? teamWaiting && !waiting.has(agent.id)
        ? t("sessions.pane.needsYouSubAgent")
        : t("sessions.status.needsYou")
      : restartStopped
        ? t("sessions.pane.stoppedByRestart")
        : [agent.statusNote ?? [leadLabel(agent), agent.worktree?.state === "active" ? agent.worktree.branch : undefined].filter(Boolean).join(" · "), teamNote]
          .filter(Boolean)
          .join(" · ");
    return (
      <li key={agent.id} className="group relative">
        <span className={`absolute right-1 top-1 z-10 gap-0.5 rounded bg-zinc-100 dark:bg-zinc-900 ${REVEAL_ON_HOVER}`}>
          {agent.archivedAt === undefined ? (
            <button type="button" aria-label={t("sessions.pane.archiveNamed", { name: agent.name })} title={t("sessions.common.archive")} className={ROW_ACTION} onClick={() => setArchived(agent.id, true, t)}>
              <Archive size={13} />
            </button>
          ) : (
            <button type="button" aria-label={t("sessions.pane.restoreNamed", { name: agent.name })} title={t("sessions.common.restore")} className={ROW_ACTION} onClick={() => setArchived(agent.id, false, t)}>
              <ArchiveRestore size={13} />
            </button>
          )}
          <button type="button" aria-label={t("sessions.pane.deleteNamed", { name: agent.name })} title={t("sessions.common.delete")} className={ROW_ACTION} onClick={() => setDeletingId(agent.id)}>
            <Trash2 size={13} />
          </button>
        </span>
        <button
          type="button"
          onClick={() => workbench.open({ kind: "session", agentId: agent.id }, { preview: true })}
          onDoubleClick={() => workbench.open({ kind: "session", agentId: agent.id })}
          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
            selected ? SELECTED_ROW : ROW_HOVER
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {/* A spinner, not a dot, while it or its team works, so it reads as busy at a glance. */}
          {!needsYou && (agent.status === "running" || working > 0) ? (
            <LoaderCircle size={12} aria-label={t("sessions.status.working")} className="mt-0.5 shrink-0 animate-spin text-teal-500 dark:text-teal-400" />
          ) : (
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${needsYou ? "bg-amber-500 animate-pulse" : DOT[agent.status]}`} />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[13px]">{agent.name}</span>
              {now > 0 && <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-zinc-500">{relativeTime(agent.lastActivityAt, now)}</span>}
            </span>
            <span className={`flex items-center gap-1 truncate text-[11px] ${needsYou ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
              {agent.worktree?.state === "active" && !needsYou && agent.statusNote === undefined && <GitBranch size={10} aria-hidden />}
              <span className="truncate" title={t("sessions.pane.ledBy", { lead: leadLabel(agent) })}>
                {detail}
              </span>
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={t("section.sessions")}>
        <button type="button" aria-label={t("sessions.pane.questions")} title={t("sessions.pane.questionsTitle")} className={ICON_BUTTON} onClick={() => workbench.open({ kind: "inbox" })}>
          <MessageCircleQuestion size={14} />
        </button>
        <button type="button" aria-label={t("sessions.common.agentGraph")} title={t("sessions.common.agentGraph")} className={ICON_BUTTON} onClick={() => workbench.open({ kind: "graph" })}>
          <Network size={14} />
        </button>
        <button type="button" aria-label={t("sessions.common.importSession")} title={t("sessions.pane.importTitle")} className={ICON_BUTTON} onClick={() => setImporting(true)}>
          <Download size={14} />
        </button>
        <button type="button" aria-label={t("sessions.common.newSession")} title={t("sessions.pane.newSessionTitle", { key: formatBinding("c") })} className={ICON_BUTTON} onClick={() => openNewAgent()}>
          <Plus size={14} />
        </button>
      </PaneHeader>
      <div className="px-2 pb-2">
        <input
          aria-label={t("sessions.common.filterSessions")}
          className="h-7 w-full rounded-md border border-zinc-300 bg-transparent px-2 text-xs dark:border-zinc-700"
          placeholder={t("sessions.common.filterSessions")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {openQuestions.length > 0 && (
          <section className="mb-2">
            <h4 className="px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">{t("sessions.pane.needsYouCount", { count: openQuestions.length })}</h4>
            <ul>
              {openQuestions.map((question) => (
                <li key={question.id}>
                  <button
                    type="button"
                    onClick={() => workbench.open({ kind: "inbox", questionId: question.id })}
                    className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left ${
                      question.id === activeQuestion ? SELECTED_ROW : ROW_HOVER
                    }`}
                  >
                    <MessageCircleQuestion size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px]">
                        {question.kind === "approval" ? `${t("sessions.questions.approvalTitle")} ${question.question}` : question.question}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500">
                        {agents.find((a) => a.id === question.agentId)?.name ?? t("sessions.common.agent")}
                        {now > 0 && ` · ${relativeTime(question.createdAt, now)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {groups.length === 0 && (
          <p className="px-2 py-4 text-xs text-zinc-500">{live.length === 0 ? t("sessions.pane.empty") : t("sessions.pane.noMatch")}</p>
        )}
        {groups.map(([repo, roots]) => (
          <section key={repo} className="mb-2">
            <h4 className="px-2 py-1 text-[11px] font-medium text-zinc-500">{repo}</h4>
            <ul>
              {roots.map((root) => row(root, 0))}
            </ul>
          </section>
        ))}
        {archived.length > 0 && (
          <section className="mt-2 border-t border-zinc-200 pt-1 dark:border-zinc-800">
            <GroupHeader title={t("sessions.pane.archived")} count={archived.filter((agent) => leadOf(agent, agents).id === agent.id).length} open={showArchived} onToggle={() => setShowArchived((v) => !v)} />
            {showArchived && <ul>{archived.filter((agent) => leadOf(agent, agents).id === agent.id).map((agent) => row(agent, 0))}</ul>}
          </section>
        )}
      </div>
      {deleting !== undefined && <DeleteSessionDialog agent={deleting} onClose={() => setDeletingId(undefined)} />}
      {importing && (
        <ImportSessionDialog
          onClose={() => setImporting(false)}
          onImported={(agent) => {
            setImporting(false);
            workbench.open({ kind: "session", agentId: agent.id });
          }}
        />
      )}
    </div>
  );
}
