"use client";

import { MessageSquareWarning, RefreshCw } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useShell } from "@/shell/ShellContext";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { relativeTime } from "@/ui/format";
import { pageErrors, subscribePageErrors } from "@/ui/pageErrors";
import { useJson } from "@/ui/useJson";
import type { DebugInfo } from "@/features/feedback/model/Feedback";

/** Feedback sessions are named "Feedback: …" (see `feedbackTitle`). */
const FEEDBACK_PREFIX = "Feedback: ";

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="min-w-0 break-all font-mono">{children}</span>
    </div>
  );
}

/**
 * ### DebugTab
 *
 * Developer mode's panel: how this app runs and the state of the source
 * checkout, errors this page ran into (uncaught exceptions, failed API
 * calls), the end of the server log, and the sessions your feedback started.
 */
export function DebugTab() {
  const { data, error, reload, loading } = useJson<DebugInfo>("/api/debug");
  const errors = useSyncExternalStore(subscribePageErrors, pageErrors, pageErrors);
  const { agents, openFeedback } = useShell();
  const workbench = useWorkbench();
  const logBox = useRef<HTMLDivElement>(null);
  const feedback = agents.filter((a) => a.name.startsWith(FEEDBACK_PREFIX)).sort((a, b) => b.createdAt - a.createdAt);
  // eslint-disable-next-line react-hooks/purity -- relative times only need to be about right
  const now = Date.now();

  // The newest lines are at the bottom; scroll the log box alone, not the tab.
  useEffect(() => {
    if (logBox.current !== null) logBox.current.scrollTop = logBox.current.scrollHeight;
  }, [data]);

  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 @max-md:px-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Debug</h1>
            <p className="text-xs text-zinc-500">Developer mode. Feedback ({"⌘⌥F"}) starts a session that changes mothership&apos;s own code.</p>
          </div>
          <button type="button" className="flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500" onClick={openFeedback}>
            <MessageSquareWarning size={14} aria-hidden /> Give feedback
          </button>
        </div>

        <Section
          title="App"
          action={
            <button type="button" aria-label="Refresh" title="Refresh" className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={reload}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          }
        >
          {data === undefined ? (
            <p className="text-xs text-zinc-500">{error ?? "Loading…"}</p>
          ) : (
            <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <Row label="Running as">{data.packaged ? "Desktop app" : "pnpm dev (checkout)"}</Row>
              <Row label="Data folder">{data.dataDir}</Row>
              <Row label="Node">{data.node}</Row>
              <Row label="Source folder">{data.developer.source ?? "Not set (Settings → Developer)"}</Row>
              {data.developer.source !== undefined && (
                <>
                  <Row label="Branch">{data.developer.branch ?? "?"}</Row>
                  <Row label="Commit">{data.developer.commit ?? "?"}</Row>
                  <Row label="Uncommitted">{data.developer.changedFiles === undefined ? "?" : `${data.developer.changedFiles} files`}</Row>
                </>
              )}
            </div>
          )}
        </Section>

        <Section title="Feedback sessions">
          {feedback.length === 0 ? (
            <p className="text-xs text-zinc-500">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {feedback.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                    onClick={() => workbench.open({ kind: agent.worktree?.state === "active" ? "changes" : "session", agentId: agent.id })}
                  >
                    <span className="min-w-0 flex-1 truncate">{agent.name.slice(FEEDBACK_PREFIX.length)}</span>
                    <span className="text-zinc-500">{agent.worktree?.state === "merged" ? "merged" : agent.worktree?.state === "discarded" ? "discarded" : agent.status}</span>
                    <span className="w-16 text-right text-zinc-500">{relativeTime(agent.createdAt, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Page errors">
          {errors.length === 0 ? (
            <p className="text-xs text-zinc-500">None since this page loaded.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {[...errors].reverse().map((e) => (
                <li key={`${e.at}:${e.message}`} className="flex gap-2 rounded-md bg-red-50 px-2 py-1 font-mono text-[11px] text-red-800 dark:bg-red-950/40 dark:text-red-300">
                  <span className="shrink-0 text-red-500">{new Date(e.at).toLocaleTimeString()}</span>
                  <span className="min-w-0 break-all whitespace-pre-wrap">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Server log">
          <div ref={logBox} className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
            {(data?.log ?? []).map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
