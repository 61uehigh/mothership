"use client";

import { Archive, ArchiveRestore, Code2, ExternalLink, FileDiff, FolderOpen, GitCompare, SquareTerminal, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useShell } from "@/shell/ShellContext";
import { relativeTime } from "@/ui/format";
import { AgentToolsList } from "@/features/sessions/ui/AgentToolsList";
import { useExplorerLocation } from "@/shell/explorerLocation";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { fetchJson } from "@/ui/useJson";
import { leadOf } from "@/features/sessions/ui/team";
import { TeamTree } from "@/features/sessions/ui/TeamTree";
import { DiscardDialog, MergeDialog } from "@/features/sessions/ui/review/WorktreeActions";
import { openIn } from "@/features/sessions/ui/openIn";
import { DeleteSessionDialog, setArchived } from "@/features/sessions/ui/sessionActions";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/WorkbenchContext";
import type { Agent } from "@/features/sessions/model/Agent";

const CLOCK_TICK_MS = 30_000;
const ACTION =
  "flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
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
  const { agents, questions } = useShell();
  const [, setExplorerLocation] = useExplorerLocation();

  /** Opens the Explorer at this session's folder (home-relative, as the Explorer browses). */
  async function browse() {
    const home = await fetchJson<{ absolute: string }>("/api/files/dir?root=local");
    if (!home.ok) return;
    const folder = agent.workingDirectory;
    const path = folder === home.data.absolute ? "" : folder.startsWith(`${home.data.absolute}/`) ? folder.slice(home.data.absolute.length + 1) : undefined;
    if (path === undefined) return;
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
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const [dialog, setDialog] = useState<"merge" | "discard" | "delete" | undefined>(undefined);
  const lead = leadOf(agent, agents);
  const hasTeam = agents.some((a) => a.parentId === agent.id);
  const worktree = agent.worktree;
  const compareGroup = agent.compareGroup;

  return (
    <div className="flex flex-col">
      <Section title="Session">
        <StatusLabel agent={agent} {...statusProps(agent)} />
        {agent.statusNote !== undefined && <p className="text-xs italic text-zinc-600 dark:text-zinc-300">{agent.statusNote}</p>}
        <Row label="Model">{[agent.provider, agent.model ?? "default", agent.effort].filter(Boolean).join(" · ")}</Row>
        {agent.role !== undefined && <Row label="Role">{agent.role}</Row>}
        {now > 0 && <Row label="Active">{relativeTime(agent.lastActivityAt, now)}</Row>}
        {agent.provider === "claude" && (
          <label className="mt-1 flex items-start gap-2 text-xs" title="Plain git commands in this session's folder, outside the sandbox, with hooks off. Every push asks you first. Other shell commands stay blocked.">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agent.allowGit}
              onChange={(e) =>
                void fetch(`/api/agents/${agent.id}/git`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ allowed: e.target.checked }),
                })
              }
            />
            <span>
              Allow git <span className="text-zinc-500">· commits, history edits, fetch; every push asks you first</span>
            </span>
          </label>
        )}
      </Section>

      <Section title="Workspace">
        {worktree === undefined ? (
          <Row label="Folder">{agent.workingDirectory}</Row>
        ) : (
          <>
            <Row label="Repo">{worktree.repo}</Row>
            <Row label="Branch">{worktree.branch}</Row>
            <Row label="Base">{worktree.baseBranch}</Row>
            <Row label="State">{worktree.state}</Row>
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button type="button" className={ACTION} onClick={() => openIn(agent.id, "terminal")}>
            <SquareTerminal size={13} aria-hidden /> Terminal
          </button>
          <button type="button" className={ACTION} onClick={() => openIn(agent.id, "vscode")}>
            <Code2 size={13} aria-hidden /> Editor
          </button>
          <button type="button" className={ACTION} title="Open this folder in the Explorer" onClick={() => void browse()}>
            <FolderOpen size={13} aria-hidden /> Browse
          </button>
        </div>
      </Section>

      {worktree !== undefined && (
        <Section title="Changes">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={ACTION} onClick={() => workbench.open({ kind: "changes", agentId: agent.id })}>
              <FileDiff size={13} aria-hidden /> Review changes
            </button>
            {compareGroup !== undefined && (
              <button type="button" className={ACTION} onClick={() => workbench.open({ kind: "compare", group: compareGroup })}>
                <GitCompare size={13} aria-hidden /> Comparison
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
                Approve and merge
              </button>
              <button type="button" className="rounded-md px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setDialog("discard")}>
                Discard
              </button>
            </div>
          )}
        </Section>
      )}

      <Section title="Tools">
        <AgentToolsList agent={agent} />
      </Section>

      {lead.id !== agent.id && (
        <Section title="Lead">
          <button type="button" className="text-left text-xs hover:underline" onClick={() => workbench.open({ kind: "session", agentId: lead.id })}>
            ↑ {lead.name}
          </button>
        </Section>
      )}
      {hasTeam && (
        <Section title="Team">
          <TeamTree lead={agent} />
        </Section>
      )}

      {agent.links.length > 0 && (
        <Section title="Links">
          {agent.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-600 hover:underline dark:text-sky-400">
              {link.label} <ExternalLink size={11} aria-hidden />
            </a>
          ))}
        </Section>
      )}

      <section className="flex flex-wrap gap-1.5 px-3 py-3">
        {agent.archivedAt === undefined ? (
          <button type="button" className={ACTION} onClick={() => setArchived(agent.id, true)}>
            <Archive size={13} aria-hidden /> Archive
          </button>
        ) : (
          <button type="button" className={ACTION} onClick={() => setArchived(agent.id, false)}>
            <ArchiveRestore size={13} aria-hidden /> Restore
          </button>
        )}
        <button type="button" className={`${ACTION} text-red-600 dark:text-red-400`} onClick={() => setDialog("delete")}>
          <Trash2 size={13} aria-hidden /> Delete
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
