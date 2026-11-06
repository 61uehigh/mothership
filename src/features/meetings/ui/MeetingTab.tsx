"use client";

import { Check, CheckCircle2, ChevronRight, CircleHelp, Clock, Gavel, ListPlus, ListTodo, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isClaudeLoginFailure } from "@/shell/claudeLogin";
import { ClaudeLoginNote } from "@/shell/ClaudeLoginNote";
import { Markdown } from "@/shell/Markdown";
import { Chip, FRAME_BUTTON, TabFrame } from "@/shell/tabFrame";
import type { Tab } from "@/shell/tabs";
import { addTodo } from "@/shell/todos";
import { toolLoadError, toolUnavailableText } from "@/shell/toolFailureText";
import { useJson } from "@/ui/useJson";
import type { MeetingSummary, MeetingSummaryView } from "@/features/meetings/model/Meetings";
import type { NuclinoDoc } from "@/features/tools/model/Tools";
import { nuclinoUrl } from "@/features/tools/model/toolUrls";
import { useFormat } from "@/ui/i18n/format";
import { useLocale, useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { followUpTodo } from "@/features/todos/model/Todos";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

function Group({ icon, title, empty, children }: { icon: ReactNode; title: string; empty: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {icon}
        {title}
      </h2>
      {empty ? <p className="pl-5 text-[13px] text-zinc-500">{t("meetings.noneInNote")}</p> : <ul className="flex flex-col gap-1 pl-5 text-[13px] leading-5">{children}</ul>}
    </section>
  );
}

const Tag = ({ children }: { children: ReactNode }) => (
  <span className="ml-1.5 inline-flex rounded bg-zinc-200/70 px-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{children}</span>
);

/** One follow-up, with a button that adds it to your to-dos. */
function FollowUp({ action, source }: { action: MeetingSummary["actions"][number]; source: { itemId: string; title: string } }) {
  const t = useT();
  const [added, setAdded] = useState<"no" | "adding" | "yes">("no");
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const due = action.due !== undefined && action.due !== "" ? action.due : undefined;
  const todo = followUpTodo(action, (what, vague) => t("meetings.todoWithDue", { what, due: vague }));
  async function add(fields: NonNullable<typeof todo>) {
    setAdded("adding");
    const outcome = await addTodo({ ...fields, source: { kind: "meeting", ...source } });
    setAdded(outcome.ok ? "yes" : "no");
    setFailure(outcome.ok ? undefined : outcome.error);
  }
  return (
    <li className="group/follow list-disc">
      {action.what}
      {action.owner !== undefined && action.owner !== "" && <Tag>{action.owner}</Tag>}
      {due !== undefined && <Tag>{t("meetings.due", { due })}</Tag>}
      {added === "yes" ? (
        <span className="ml-1.5 inline-flex items-center gap-0.5 align-[-1px] text-[11px] text-teal-600 dark:text-teal-400">
          <Check size={11} aria-hidden />
          {t("meetings.inTodo")}
        </span>
      ) : todo === undefined ? null : (
        <button
          type="button"
          disabled={added === "adding"}
          onClick={() => void add(todo)}
          className="ml-1.5 inline-flex items-center gap-0.5 align-[-1px] text-[11px] text-zinc-500 opacity-0 hover:text-zinc-900 focus-visible:opacity-100 group-hover/follow:opacity-100 dark:hover:text-zinc-100"
        >
          <ListPlus size={11} aria-hidden />
          {t("meetings.addToTodo")}
        </button>
      )}
      {failure !== undefined && <span className="ml-1.5 text-[11px] text-red-600 dark:text-red-400">{failure}</span>}
    </li>
  );
}

/** The full note under the summary, read only when you unfold it. */
function FullNote({ itemId }: { itemId: string }) {
  const t = useT();
  const { locale } = useLocale();
  const [shown, setShown] = useState(false);
  const doc = useJson<NuclinoDoc>(shown ? `/api/meetings/note?id=${encodeURIComponent(itemId)}` : undefined);
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)} className="flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ChevronRight size={14} className={`transition-transform ${shown ? "rotate-90" : ""}`} aria-hidden />
        {t("meetings.fullNote")}
      </button>
      {shown && (doc.data === undefined ? <p className="text-sm text-zinc-500">{toolLoadError(t, locale, doc.failure, "nuclino") ?? t("meetings.readingNote")}</p> : <Markdown>{doc.data.markdown}</Markdown>)}
    </section>
  );
}

/**
 * ### MeetingTab
 *
 * Claude's summary of one meeting note (what was done, decided, left to do,
 * and left open), with the note itself folded underneath. The summary is
 * made on first open and again only after the note changes, or when you ask.
 */
export function MeetingTab({ tab }: { tab: Extract<Tab, { kind: "meeting" }> }) {
  const t = useT();
  const { locale } = useLocale();
  const { dateLocale } = useFormat();
  const [fresh, setFresh] = useState(0);
  const base = `/api/meetings/summary?id=${encodeURIComponent(tab.itemId)}`;
  const state = useJson<MeetingSummaryView>(fresh === 0 ? base : `${base}&fresh=1&n=${fresh}`, { keepPrevious: true });
  const view = state.data;
  const summary = view?.summary;
  const loginFailed = isClaudeLoginFailure(state.failure);

  return (
    <TabFrame
      title={itemTitle(t, view?.title ?? tab.title)}
      chips={
        <>
          <Chip>{t("meetings.chip")}</Chip>
          {view?.updatedAt !== undefined && (
            <Chip>
              <Clock size={11} aria-hidden />
              <span className="whitespace-nowrap">{t("tools.updated", { when: new Date(view.updatedAt).toLocaleString(dateLocale, DATE_FORMAT) })}</span>
            </Chip>
          )}
          {view !== undefined && (
            <Chip className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <Sparkles size={11} aria-hidden />
              <span className="whitespace-nowrap">{t("meetings.summarized", { when: new Date(view.summarizedAt).toLocaleString(dateLocale, DATE_FORMAT) })}</span>
            </Chip>
          )}
        </>
      }
      open={{ label: t("nuclino.openIn"), url: view?.url ?? nuclinoUrl(tab.itemId) }}
      actions={
        <button type="button" className={FRAME_BUTTON} disabled={state.loading} onClick={() => setFresh((n) => n + 1)}>
          <Sparkles size={12} aria-hidden />
          {t("meetings.summarizeAgain")}
        </button>
      }
      // The full note stays readable while the summary loads or when it fails.
      state={{ ...state, data: true, error: state.loading || loginFailed || state.failure === undefined ? undefined : (toolUnavailableText(t, locale, state.failure) ?? state.error) }}
    >
      {!state.loading && loginFailed && state.error !== undefined && <ClaudeLoginNote error={state.error} />}
      {state.loading && <p className="text-sm text-zinc-500">{t(view === undefined ? "meetings.firstSummary" : "meetings.summarizingAgain")}</p>}
      {summary !== undefined && (
        <div className={`flex flex-col gap-5 ${state.loading ? "opacity-50" : ""}`}>
          <p className="text-[14px] leading-6 text-zinc-800 dark:text-zinc-200">{summary.gist}</p>
          <Group icon={<Gavel size={14} className="text-amber-600" aria-hidden />} title={t("meetings.decisions")} empty={summary.decisions.length === 0}>
            {summary.decisions.map((d, i) => (
              <li key={i} className="list-disc">
                {d.what}
                {d.date !== undefined && d.date !== "" && <Tag>{d.date}</Tag>}
              </li>
            ))}
          </Group>
          <Group icon={<ListTodo size={14} className="text-teal-600" aria-hidden />} title={t("meetings.followUps")} empty={summary.actions.length === 0}>
            {summary.actions.map((a, i) => (
              <FollowUp key={`${i}:${a.what}`} action={a} source={{ itemId: tab.itemId, title: view?.title ?? tab.title }} />
            ))}
          </Group>
          <Group icon={<CheckCircle2 size={14} className="text-emerald-600" aria-hidden />} title={t("meetings.done")} empty={summary.done.length === 0}>
            {summary.done.map((d, i) => (
              <li key={i} className="list-disc">
                {d}
              </li>
            ))}
          </Group>
          <Group icon={<CircleHelp size={14} className="text-zinc-500" aria-hidden />} title={t("meetings.notDecided")} empty={summary.open.length === 0}>
            {summary.open.map((o, i) => (
              <li key={i} className="list-disc">
                {o}
              </li>
            ))}
          </Group>
        </div>
      )}
      <FullNote itemId={tab.itemId} />
    </TabFrame>
  );
}
