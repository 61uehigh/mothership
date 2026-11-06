"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveMessages, useShell } from "@/shell/shellContext";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { StatusLabel } from "@/features/sessions/ui/StatusLabel";
import { useCommands, type Command } from "@/shell/commands/commandContext";
import { formatBinding } from "@/shell/commands/keys";
import { parseDiff, type DiffFile } from "@/ui/parseDiff";
import { fetchJson, fetchText } from "@/ui/useJson";
import { DiscardDialog, MergeDialog } from "@/features/sessions/ui/review/worktreeActions";
import { canMergeNow, type Agent, type AgentEventRecord } from "@/features/sessions/model/Agent";
import { useT } from "@/ui/i18n/useT";

type Attempt = Agent & { worktree: NonNullable<Agent["worktree"]> };

function useAttemptDetail(agent: Attempt) {
  const [files, setFiles] = useState<Array<DiffFile> | undefined>(undefined);
  const [output, setOutput] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const active = agent.worktree.state === "active";

  // Reload after each finished turn; a running agent's results are still changing.
  useEffect(() => {
    if (agent.status === "running") return;
    let cancelled = false;
    void (async () => {
      const detail = await fetchJson<{ events: Array<AgentEventRecord> }>(`/api/agents/${agent.id}`);
      if (cancelled) return;
      if (detail.ok) {
        const done = detail.data.events.filter((r) => r.event.type === "done").at(-1);
        setOutput(done?.event.type === "done" ? done.event.output : undefined);
      }
      const diff = active ? await fetchText(`/api/agents/${agent.id}/diff`) : undefined;
      if (cancelled) return;
      if (diff?.ok === true) setFiles(parseDiff(diff.data));
      setError(!detail.ok ? detail.error : diff?.ok === false ? diff.error : undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [agent.id, agent.status, agent.lastActivityAt, active]);

  return { files, output, error };
}

function AttemptColumn({
  agent,
  focused,
  dialog,
  onFocus,
  onDialog,
}: {
  agent: Attempt;
  focused: boolean;
  dialog: "merge" | "discard" | undefined;
  onFocus: () => void;
  onDialog: (dialog: "merge" | "discard" | undefined) => void;
}) {
  const t = useT();
  const { files, output, error } = useAttemptDetail(agent);
  const workbench = useWorkbenchActions();
  const { worktree } = agent;
  const additions = files?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const deletions = files?.reduce((n, f) => n + f.deletions, 0) ?? 0;

  return (
    <section
      onClick={onFocus}
      className={`flex min-h-0 flex-col gap-3 rounded-xl border bg-white p-4 dark:bg-zinc-900 ${
        worktree.state === "merged"
          ? "border-teal-500"
          : focused
            ? "border-teal-500/60"
            : "border-zinc-200 dark:border-zinc-800"
      } ${worktree.state === "discarded" ? "opacity-50" : ""}`}
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate font-semibold">{agent.name}</h2>
          {worktree.state === "merged" && <span className="rounded bg-teal-600 px-1.5 text-[11px] text-white">{t("sessions.common.merged")}</span>}
          {worktree.state === "discarded" && <span className="rounded bg-zinc-600 px-1.5 text-[11px] text-white">{t("sessions.common.discarded")}</span>}
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          {[agent.provider, agent.model, agent.effort].filter(Boolean).join(" · ")}
        </span>
        <StatusLabel agent={agent} turns={output === undefined ? 0 : 1} queued={0} waiting={false} />
        {agent.statusNote !== undefined && <p className="text-xs italic text-zinc-600 dark:text-zinc-300">{agent.statusNote}</p>}
      </header>

      {worktree.state === "active" && (
        <div className="text-xs">
          {files === undefined ? (
            error === undefined && <span className="text-zinc-500">{t("sessions.compare.loadingChanges")}</span>
          ) : (
            <>
              <p>
                {files.length === 1 ? t("sessions.common.files.one", { count: 1 }) : t("sessions.common.files.other", { count: files.length })} · <span className="text-green-600">+{additions}</span>{" "}
                <span className="text-red-600">-{deletions}</span>
              </p>
              <ul className="mt-1 font-mono text-[11px] text-zinc-500">
                {files.slice(0, 8).map((f) => (
                  <li key={f.path} className="truncate">
                    {f.path} <span className="text-green-600">+{f.additions}</span> <span className="text-red-600">-{f.deletions}</span>
                  </li>
                ))}
                {files.length > 8 && <li>{t("sessions.compare.more", { count: files.length - 8 })}</li>}
              </ul>
            </>
          )}
        </div>
      )}

      {error !== undefined && <p className="break-words text-xs text-red-600 dark:text-red-400">{t("sessions.compare.loadFailed", { error })}</p>}

      <div className="min-h-24 flex-1 overflow-y-auto rounded-md bg-zinc-50 p-2.5 text-sm whitespace-pre-wrap break-words dark:bg-zinc-950">
        {output ?? <span className="text-zinc-500">{agent.status === "running" ? t("sessions.compare.working") : t("sessions.compare.noReport")}</span>}
      </div>

      <footer className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={() => workbench.open({ kind: "changes", agentId: agent.id })}
        >
          {t("sessions.compare.viewChanges")}
        </button>
        {worktree.state === "active" && (
          <>
            <button
              type="button"
              disabled={!canMergeNow(agent)}
              title={focused ? formatBinding("shift+a") : undefined}
              className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              onClick={() => onDialog("merge")}
            >
              {t("sessions.compare.mergeThis")}
            </button>
            <button
              type="button"
              title={focused ? formatBinding("shift+x") : undefined}
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => onDialog("discard")}
            >
              {t("sessions.common.discard")}
            </button>
          </>
        )}
      </footer>

      {dialog === "merge" && (
        <MergeDialog agent={agent} fileCount={files?.length} onClose={() => onDialog(undefined)} onDone={() => onDialog(undefined)} />
      )}
      {dialog === "discard" && <DiscardDialog agent={agent} onClose={() => onDialog(undefined)} onDone={() => onDialog(undefined)} />}
    </section>
  );
}

/**
 * ### CompareView
 *
 * Every attempt in one comparison group side by side: progress, diff size,
 * and final report. Merging one discards the rest.
 */
export function CompareView({ group }: { group: string }) {
  const t = useT();
  const { agents } = useShell();
  const messages = useLiveMessages();
  const attempts = useMemo(
    () =>
      agents
        .filter((a): a is Attempt => a.compareGroup === group && a.worktree !== undefined)
        .sort((a, b) => a.createdAt - b.createdAt),
    [agents, group],
  );
  const task = messages.find((m) => m.agentId === attempts[0]?.id && m.senderId === undefined)?.text;
  const [focused, setFocused] = useState(0);
  // Keyed by agent id, so a change in the attempts list never moves an open dialog onto another attempt.
  const [dialog, setDialog] = useState<{ agentId: string; kind: "merge" | "discard" } | undefined>(undefined);

  // Commands read the latest render through this ref so they register once.
  const latest = useRef({ attempts, focused });
  useEffect(() => {
    latest.current = { attempts, focused };
  });

  const commands = useMemo<Array<Command>>(() => {
    const move = (delta: number) => {
      const count = latest.current.attempts.length;
      if (count > 0) setFocused((i) => Math.min(Math.max(i + delta, 0), count - 1));
    };
    const open = (kind: "merge" | "discard") => {
      const { attempts: list, focused: index } = latest.current;
      const attempt = list[index];
      if (attempt === undefined) return;
      if (kind === "merge" ? canMergeNow(attempt) : attempt.worktree.state === "active") setDialog({ agentId: attempt.id, kind });
    };
    return [
      { id: "compare-next", title: t("sessions.compare.cmdNext"), group: "Compare", keys: ["right", "l"], run: () => move(1) },
      { id: "compare-prev", title: t("sessions.compare.cmdPrev"), group: "Compare", keys: ["left", "h"], run: () => move(-1) },
      { id: "compare-merge", title: t("sessions.compare.cmdMerge"), group: "Compare", keys: ["shift+a"], run: () => open("merge") },
      { id: "compare-discard", title: t("sessions.compare.cmdDiscard"), group: "Compare", keys: ["shift+x"], run: () => open("discard") },
    ];
  }, [t]);
  useCommands(commands);

  if (attempts.length === 0) {
    return <p className="p-6 text-sm text-zinc-500">{t("sessions.compare.notFound")}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t("sessions.common.compareRun")}</h1>
        {task !== undefined && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{task}</p>}
        <p className="text-xs text-zinc-500">
          {t("sessions.compare.hint", { left: formatBinding("left"), right: formatBinding("right"), merge: formatBinding("shift+a"), discard: formatBinding("shift+x") })}
        </p>
      </header>
      <div className={`grid min-h-0 flex-1 gap-4 md:grid-cols-2 ${attempts.length > 2 ? "xl:grid-cols-3" : ""}`}>
        {attempts.map((agent, index) => (
          <AttemptColumn
            key={agent.id}
            agent={agent}
            focused={index === focused}
            dialog={dialog?.agentId === agent.id ? dialog.kind : undefined}
            onFocus={() => setFocused(index)}
            onDialog={(kind) => setDialog(kind === undefined ? undefined : { agentId: agent.id, kind })}
          />
        ))}
      </div>
    </div>
  );
}
