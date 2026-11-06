"use client";

import { MessageSquareWarning, RefreshCw } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { formatBinding } from "@/shell/commands/keys";
import { useShell } from "@/shell/shellContext";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { useFormat } from "@/ui/i18n/format";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { pageErrors, subscribePageErrors } from "@/ui/pageErrors";
import { useJson } from "@/ui/useJson";
import type { DebugInfo } from "@/features/feedback/model/Feedback";
import type { Agent } from "@/features/sessions/model/Agent";
import { statusKey } from "@/features/sessions/model/statusKey";

function feedbackStatus(t: Translate, agent: Agent, waiting: boolean): string {
  if (agent.worktree?.state === "merged") return t("sessions.common.merged");
  if (agent.worktree?.state === "discarded") return t("sessions.common.discarded");
  return t(`sessions.status.${statusKey(agent, { answered: agent.sessionRef !== undefined, waiting })}`);
}

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
      <span className="min-w-0 truncate text-zinc-500" title={label}>
        {label}
      </span>
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
  const t = useT();
  const { relativeTime, dateLocale } = useFormat();
  const { data, error, reload, loading } = useJson<DebugInfo>("/api/debug");
  const errors = useSyncExternalStore(subscribePageErrors, pageErrors, pageErrors);
  const { agents, questions, openFeedback } = useShell();
  const workbench = useWorkbenchActions();
  const logBox = useRef<HTMLDivElement>(null);
  const feedback = agents.filter((a) => a.origin === "feedback").sort((a, b) => b.createdAt - a.createdAt);
  const waiting = new Set(questions.filter((q) => q.status === "open").map((q) => q.agentId));
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
            <h1 className="text-lg font-semibold">{t("debug.title")}</h1>
            <p className="text-xs text-zinc-500">{t("debug.intro", { keys: formatBinding("mod+alt+f") })}</p>
          </div>
          <button type="button" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500" onClick={openFeedback}>
            <MessageSquareWarning size={14} aria-hidden /> {t("debug.giveFeedback")}
          </button>
        </div>

        <Section
          title={t("debug.app")}
          action={
            <button type="button" aria-label={t("ui.refresh")} title={t("ui.refresh")} className="rounded p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={reload}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          }
        >
          {data === undefined ? (
            <p className="text-xs text-zinc-500">{error ?? t("ui.loading")}</p>
          ) : (
            <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <Row label={t("debug.runningAs")}>{data.packaged ? t("debug.desktopApp") : t("debug.devCheckout")}</Row>
              <Row label={t("debug.dataFolder")}>{data.dataDir}</Row>
              <Row label="Node">{data.node}</Row>
              <Row label={t("debug.sourceFolder")}>{data.developer.source ?? t("debug.sourceNotSet")}</Row>
              {data.developer.source !== undefined && (
                <>
                  <Row label={t("debug.branch")}>{data.developer.branch ?? "?"}</Row>
                  <Row label={t("debug.commit")}>{data.developer.commit ?? "?"}</Row>
                  <Row label={t("debug.uncommitted")}>{data.developer.changedFiles === undefined ? "?" : t("debug.files", { count: data.developer.changedFiles })}</Row>
                </>
              )}
            </div>
          )}
        </Section>

        <Section title={t("debug.toolCalls")}>
          {data === undefined || data.toolCalls.length === 0 ? (
            <p className="text-xs text-zinc-500">{data === undefined ? t("ui.loading") : t("debug.none")}</p>
          ) : (
            <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              {data.toolCalls.map((tool) => (
                <Row key={tool.tool} label={tool.tool}>
                  {t("debug.calls", { count: tool.calls })}
                  {tool.rateLimited > 0 && t("debug.rateLimited", { count: tool.rateLimited })}
                  {tool.held > 0 && t("debug.heldBack", { count: tool.held })}
                  {tool.bySource.length > 0 && ` — ${tool.bySource.map((s) => `${s.source} ${s.calls}`).join(", ")}`}
                  {tool.byName.length > 0 && ` (${tool.byName.map((n) => `${n.name} ${n.calls}`).join(", ")})`}
                </Row>
              ))}
              <p className="pt-1 text-[11px] text-zinc-500">{t("debug.toolCallsNote")}</p>
            </div>
          )}
        </Section>

        <Section title={t("debug.feedbackSessions")}>
          {feedback.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("debug.noneYet")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {feedback.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                    onClick={() => workbench.open({ kind: agent.worktree?.state === "active" ? "changes" : "session", agentId: agent.id })}
                  >
                    <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-zinc-500">{feedbackStatus(t, agent, waiting.has(agent.id))}</span>
                    <span className="shrink-0 whitespace-nowrap text-right text-zinc-500">{relativeTime(agent.createdAt, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("debug.pageErrors")}>
          {errors.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("debug.noPageErrors")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {[...errors].reverse().map((e) => (
                <li key={`${e.at}:${e.message}`} className="flex gap-2 rounded-md bg-red-50 px-2 py-1 font-mono text-[11px] text-red-800 dark:bg-red-950/40 dark:text-red-300">
                  <span className="shrink-0 text-red-500">{new Date(e.at).toLocaleTimeString(dateLocale)}</span>
                  <span className="min-w-0 break-all whitespace-pre-wrap">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("debug.serverLog")}>
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
