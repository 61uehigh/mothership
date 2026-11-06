"use client";

import { Archive, ArchiveRestore, Code2, ExternalLink, FileDiff, FolderOpen, GitCompare, SquareTerminal, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useShell } from "@/shell/shellContext";
import { AgentToolsList } from "@/features/sessions/ui/AgentToolsList";
import { useExplorerLocation } from "@/shell/explorerLocation";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { fetchJson, fetchText, jsonRequest } from "@/ui/useJson";
import { reportFailure, showError } from "@/ui/notices";
import { leadOf } from "@/features/sessions/ui/team";
import { TeamTree } from "@/features/sessions/ui/TeamTree";
import { DiscardDialog, MergeDialog } from "@/features/sessions/ui/review/worktreeActions";
import { openAgentFolderIn } from "@/features/sessions/ui/openAgentFolderIn";
import { agentModelLabel, DeleteSessionDialog, setArchived } from "@/features/sessions/ui/sessionActions";
import { useNow } from "@/ui/useNow";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";
import { AGENT_CAPABILITIES } from "@/features/sessions/model/AgentEvents";
import { useT } from "@/ui/i18n/useT";
import { useFormat } from "@/ui/i18n/format";
import { relativeInside } from "@/lib/filePaths";

const CLOCK_TICK_MS = 30_000;

const WORKTREE_STATE = {
  active: "sessions.info.state.active",
  merged: "sessions.info.state.merged",
  discarded: "sessions.info.state.discarded",
} as const;
const ACTION =
  "flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 [&:lang(ko)]:tracking-normal">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-16 shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[11px]">{children}</span>
    </div>
  );
}

/**
 * ### SessionInfo
 *
 * Details column beside a session tab: status, model, where it works (repository,
 * branch, worktree), links, its parent and sub-agents, and actions (review,
 * compare, open folder, merge, discard).
 */
export function SessionInfo({ agent }: { agent: Agent }) {
  const t = useT();
  const { relativeTime } = useFormat();
  const { agents, questions } = useShell();
  const [, setExplorerLocation] = useExplorerLocation();

  /** Opens the Explorer at this session's folder (home-relative, as the Explorer browses). */
  async function browse() {
    const home = await fetchJson<{ absolute: string }>("/api/files/dir?root=local");
    if (!reportFailure(t("sessions.info.explorerFailed"), home)) return;
    // The Explorer's paths use `/`, also on Windows.
    const path = relativeInside(home.data.absolute, agent.workingDirectory)?.replaceAll("\\", "/");
    if (path === undefined) {
      showError(t("sessions.info.explorerOutsideHome"));
      return;
    }
    // Folders such as .mothership/worktrees are hidden; show hidden entries so the path stays visible.
    setExplorerLocation({ path, hidden: path.split("/").some((part) => part.startsWith(".")) });
    workbench.open({ kind: "section", section: "files" });
  }
  // A session that has a provider session has run at least one turn ("Done" rather than "Idle").
  const statusProps = (a: Agent) => ({
    turns: a.sessionRef === undefined ? 0 : 1,
    queued: 0,
    waiting: questions.some((q) => q.agentId === a.id && q.status === "open"),
  });
  const workbench = useWorkbenchActions();
  const now = useNow(CLOCK_TICK_MS);
  const [dialog, setDialog] = useState<"merge" | "discard" | "delete" | undefined>(undefined);
  const [gitSaving, setGitSaving] = useState(false);
  const [gitError, setGitError] = useState<string | undefined>(undefined);

  /** The box shows the server's value, so a refused change leaves it as it was. */
  async function setAllowGit(allowed: boolean) {
    setGitSaving(true);
    setGitError(undefined);
    const result = await fetchText(`/api/agents/${agent.id}/git`, jsonRequest("POST", { allowed }));
    setGitSaving(false);
    if (!result.ok) setGitError(result.error);
  }
  const lead = leadOf(agent, agents);
  const hasTeam = agents.some((a) => a.parentId === agent.id);
  const worktree = agent.worktree;
  const compareGroup = agent.compareGroup;

  return (
    <div className="flex flex-col">
      <Section title={t("sessions.info.session")}>
        <StatusLabel agent={agent} {...statusProps(agent)} />
        {agent.statusNote !== undefined && <p className="text-xs italic text-zinc-600 dark:text-zinc-300">{agent.statusNote}</p>}
        <Row label={t("sessions.common.model")}>{agentModelLabel(agent, t("sessions.info.defaultModel"))}</Row>
        {agent.role !== undefined && <Row label={t("sessions.common.role")}>{agent.role}</Row>}
        {now > 0 && <Row label={t("sessions.info.active")}>{relativeTime(agent.lastActivityAt, now)}</Row>}
        {AGENT_CAPABILITIES[agent.provider].gitAccess && (
          <label className="mt-1 flex items-start gap-2 text-xs" title={t("sessions.info.gitTitle")}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agent.allowGit}
              disabled={gitSaving}
              onChange={(e) => void setAllowGit(e.target.checked)}
            />
            <span>
              {t("sessions.common.allowGit")} <span className="text-zinc-500">{t(AGENT_CAPABILITIES[agent.provider].asksBeforePush ? "sessions.info.gitNote" : "sessions.info.gitNoteUnasked")}</span>
            </span>
          </label>
        )}
        {gitError !== undefined && <p className="break-words text-xs text-red-600 dark:text-red-400">{t("sessions.info.gitFailed", { error: gitError })}</p>}
      </Section>

      <Section title={t("sessions.info.workspace")}>
        {worktree === undefined ? (
          <Row label={t("sessions.info.folder")}>{agent.workingDirectory}</Row>
        ) : (
          <>
            <Row label={t("sessions.info.repo")}>{worktree.repo}</Row>
            <Row label={t("sessions.info.branch")}>{worktree.branch}</Row>
            <Row label={t("sessions.info.base")}>{worktree.baseBranch}</Row>
            <Row label={t("sessions.info.state")}>{t(WORKTREE_STATE[worktree.state])}</Row>
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button type="button" className={ACTION} onClick={() => openAgentFolderIn(agent.id, "terminal", t)}>
            <SquareTerminal size={13} aria-hidden /> {t("sessions.info.terminal")}
          </button>
          <button type="button" className={ACTION} onClick={() => openAgentFolderIn(agent.id, "vscode", t)}>
            <Code2 size={13} aria-hidden /> {t("sessions.info.editor")}
          </button>
          <button type="button" className={ACTION} title={t("sessions.info.browseTitle")} onClick={() => void browse()}>
            <FolderOpen size={13} aria-hidden /> {t("sessions.info.browse")}
          </button>
        </div>
      </Section>

      {worktree !== undefined && (
        <Section title={t("sessions.info.changes")}>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={ACTION} onClick={() => workbench.open({ kind: "changes", agentId: agent.id })}>
              <FileDiff size={13} aria-hidden /> {t("sessions.info.reviewChanges")}
            </button>
            {compareGroup !== undefined && (
              <button type="button" className={ACTION} onClick={() => workbench.open({ kind: "compare", group: compareGroup })}>
                <GitCompare size={13} aria-hidden /> {t("sessions.info.comparison")}
              </button>
            )}
          </div>
          {worktree.state === "active" && (
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={agent.status === "running"}
                className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                onClick={() => setDialog("merge")}
              >
                {t("sessions.common.approveAndMerge")}
              </button>
              <button type="button" className="rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setDialog("discard")}>
                {t("sessions.common.discard")}
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title={t("sessions.info.tools")}>
        <AgentToolsList agent={agent} />
      </Section>

      {lead.id !== agent.id && (
        <Section title={t("sessions.common.lead")}>
          <button type="button" className="text-left text-xs hover:underline" onClick={() => workbench.open({ kind: "session", agentId: lead.id })}>
            ↑ {lead.name}
          </button>
        </Section>
      )}
      {hasTeam && (
        <Section title={t("sessions.info.team")}>
          <TeamTree lead={agent} />
        </Section>
      )}

      {agent.links.length > 0 && (
        <Section title={t("sessions.info.links")}>
          {agent.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-600 hover:underline dark:text-sky-400">
              {link.label} <ExternalLink size={11} aria-hidden />
            </a>
          ))}
        </Section>
      )}

      <section className="flex flex-wrap gap-1.5 px-3 py-3">
        {agent.archivedAt === undefined ? (
          <button type="button" className={ACTION} onClick={() => setArchived(agent.id, true, t)}>
            <Archive size={13} aria-hidden /> {t("sessions.common.archive")}
          </button>
        ) : (
          <button type="button" className={ACTION} onClick={() => setArchived(agent.id, false, t)}>
            <ArchiveRestore size={13} aria-hidden /> {t("sessions.common.restore")}
          </button>
        )}
        <button type="button" className={`${ACTION} text-red-600 dark:text-red-400`} onClick={() => setDialog("delete")}>
          <Trash2 size={13} aria-hidden /> {t("sessions.common.delete")}
        </button>
      </section>

      {dialog === "delete" && <DeleteSessionDialog agent={agent} onClose={() => setDialog(undefined)} />}
      {dialog === "merge" && worktree !== undefined && (
        <MergeDialog agent={{ ...agent, worktree }} fileCount={undefined} onClose={() => setDialog(undefined)} onDone={() => setDialog(undefined)} />
      )}
      {dialog === "discard" && <DiscardDialog agent={agent} onClose={() => setDialog(undefined)} onDone={() => setDialog(undefined)} />}
    </div>
  );
}
