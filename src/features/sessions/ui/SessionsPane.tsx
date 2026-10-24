"use client";

import { Archive, ArchiveRestore, ChevronRight, Download, GitBranch, Inbox, MessageCircleQuestion, Network, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useShell } from "@/shell/ShellContext";
import { relativeTime } from "@/ui/format";
import { formatBinding } from "@/shell/commands/keys";
import { useNow } from "@/ui/useNow";
import { ImportSessionDialog } from "@/features/sessions/ui/ImportSessionDialog";
import { DeleteSessionDialog, setArchived } from "@/features/sessions/ui/sessionActions";
import { leadOf, teamOf } from "@/features/sessions/ui/team";
import { ICON_BUTTON, ROW_ACTION } from "@/ui/IconButton";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";

const CLOCK_TICK_MS = 30_000;

const DOT: Record<Agent["status"], string> = {
  running: "bg-teal-400 animate-pulse",
  idle: "bg-green-500",
  failed: "bg-red-500",
  interrupted: "bg-amber-400",
};

function repoName(agent: Agent): string {
  const dir = agent.worktree?.repo ?? agent.workingDirectory;
  return dir.split("/").filter(Boolean).at(-1) ?? dir;
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
  const { agents, questions, openNewAgent } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<Agent | undefined>(undefined);
  const [importing, setImporting] = useState(false);
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
    const teamNote =
      team.length === 0 ? undefined : `${team.length} ${team.length === 1 ? "sub-agent" : "sub-agents"}${working > 0 ? `, ${working} working` : ""}`;
    const detail = needsYou
      ? `Needs you${teamWaiting && !waiting.has(agent.id) ? " (a sub-agent asked)" : ""}`
      : [agent.statusNote ?? [agent.model ?? agent.provider, agent.worktree?.state === "active" ? agent.worktree.branch : undefined].filter(Boolean).join(" · "), teamNote]
          .filter(Boolean)
          .join(" · ");
    return (
      <li key={agent.id} className="group relative">
        <span className="absolute right-1 top-1 z-10 hidden gap-0.5 rounded bg-zinc-100 group-hover:flex group-focus-within:flex dark:bg-zinc-900">
          {agent.archivedAt === undefined ? (
            <button type="button" aria-label="Archive" title="Archive" className={ROW_ACTION} onClick={() => setArchived(agent.id, true)}>
              <Archive size={13} />
            </button>
          ) : (
            <button type="button" aria-label="Restore" title="Restore" className={ROW_ACTION} onClick={() => setArchived(agent.id, false)}>
              <ArchiveRestore size={13} />
            </button>
          )}
          <button type="button" aria-label="Delete" title="Delete" className={ROW_ACTION} onClick={() => setDeleting(agent)}>
            <Trash2 size={13} />
          </button>
        </span>
        <button
          type="button"
          onClick={() => workbench.open({ kind: "session", agentId: agent.id }, { preview: true })}
          onDoubleClick={() => workbench.open({ kind: "session", agentId: agent.id })}
          className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
            selected ? "bg-teal-100/70 dark:bg-teal-900/40" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
          }`}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${needsYou ? "bg-amber-500 animate-pulse" : working > 0 && agent.status !== "running" ? DOT.running : DOT[agent.status]}`} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[13px]">{agent.name}</span>
              {now > 0 && <span className="ml-auto shrink-0 text-[10px] text-zinc-500">{relativeTime(agent.lastActivityAt, now)}</span>}
            </span>
            <span className={`flex items-center gap-1 truncate text-[11px] ${needsYou ? "text-amber-600 dark:text-amber-400" : "text-zinc-500"}`}>
              {agent.worktree?.state === "active" && !needsYou && agent.statusNote === undefined && <GitBranch size={10} aria-hidden />}
              <span className="truncate">{detail}</span>
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Sessions">
        <button type="button" aria-label="Inbox" title="Inbox: questions from agents, answered and waiting" className={ICON_BUTTON} onClick={() => workbench.open({ kind: "inbox" })}>
          <Inbox size={14} />
        </button>
        <button type="button" aria-label="Agent graph" title="Agent graph" className={ICON_BUTTON} onClick={() => workbench.open({ kind: "graph" })}>
          <Network size={14} />
        </button>
        <button type="button" aria-label="Import a session" title="Import a Claude Code or Codex session" className={ICON_BUTTON} onClick={() => setImporting(true)}>
          <Download size={14} />
        </button>
        <button type="button" aria-label="New session" title={`New session (${formatBinding("c")})`} className={ICON_BUTTON} onClick={() => openNewAgent()}>
          <Plus size={14} />
        </button>
      </PaneHeader>
      <div className="px-2 pb-2">
        <input
          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
          placeholder="Filter sessions"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {openQuestions.length > 0 && (
          <section className="mb-2">
            <h4 className="px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">Needs you ({openQuestions.length})</h4>
            <ul>
              {openQuestions.map((question) => (
                <li key={question.id}>
                  <button
                    type="button"
                    onClick={() => workbench.open({ kind: "inbox", questionId: question.id })}
                    className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left ${
                      question.id === activeQuestion ? "bg-teal-100/70 dark:bg-teal-900/40" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
                    }`}
                  >
                    <MessageCircleQuestion size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px]">{question.question}</span>
                      <span className="block truncate text-[11px] text-zinc-500">
                        {agents.find((a) => a.id === question.agentId)?.name ?? "Agent"}
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
          <p className="px-2 py-4 text-xs text-zinc-500">{live.length === 0 ? "No sessions yet. Start one with +." : "No sessions match."}</p>
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
            <button
              type="button"
              className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              onClick={() => setShowArchived((v) => !v)}
            >
              <ChevronRight size={12} className={showArchived ? "rotate-90" : ""} aria-hidden />
              Archived ({archived.filter((agent) => leadOf(agent, agents).id === agent.id).length})
            </button>
            {showArchived && <ul className="opacity-70">{archived.filter((agent) => leadOf(agent, agents).id === agent.id).map((agent) => row(agent, 0))}</ul>}
          </section>
        )}
      </div>
      {deleting !== undefined && <DeleteSessionDialog agent={deleting} onClose={() => setDeleting(undefined)} />}
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
