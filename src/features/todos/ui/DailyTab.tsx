"use client";

import { Check, ChevronLeft, ChevronRight, ClipboardCopy, Keyboard, Moon, RefreshCw } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";
import { todoTab } from "@/shell/todos";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { SECONDARY_BUTTON } from "@/ui/button";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { useJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { useT } from "@/ui/i18n/useT";
import type { Translate } from "@/ui/i18n/translate";
import type { InboxView } from "@/features/inbox/model/Inbox";
import { addDays, localDay } from "@/lib/dates";
import type { ActivityItem, ActivitySource, DayActivity } from "@/features/todos/model/Daily";
import { dailyView } from "@/features/todos/model/dailyView";
import { TODO_TITLE_MAX, type Todo, type TodoChange } from "@/features/todos/model/Todos";
import { AddTodo } from "@/features/todos/ui/AddTodo";
import { DAILY_NOTE, Disclosure, InlineAdd, Section, TEXT_BUTTON } from "@/features/todos/ui/dailyLayout";
import { ActivitySuggestions, DoneRow, InboxSuggestionRow, MeetingList, SUGGESTION_SOURCES, SuggestionGroup } from "@/features/todos/ui/dailySections";
import { UndoDeleteBar, usePendingDelete } from "@/features/todos/ui/pendingDelete";
import { TodoRow, useDayNames } from "@/features/todos/ui/todoRow";
import { todoKey } from "@/features/todos/ui/todoKeys";
import { useTodoKeys } from "@/features/todos/ui/useTodoKeys";
import { useTodoRun } from "@/features/todos/ui/useTodoRun";
import { useTodos } from "@/features/todos/ui/useTodos";
import { WrapUpPanel } from "@/features/todos/ui/WrapUpPanel";

const CLOCK_TICK_MS = 60_000;
/** A plan longer than this gets a nudge: the Ivy Lee method keeps a day to six things. */
const PLAN_LIMIT = 6;
const COPIED_MS = 1500;

/** The name of each source the day's activity is read from: product names as they are, the rest in the chosen language. */
const SOURCE_NAME: Record<ActivitySource, (t: Translate) => string> = {
  github: () => "GitHub",
  linear: () => "Linear",
  sessions: (t) => t("daily.source.sessions"),
  calendar: (t) => t("daily.source.calendar"),
};

/**
 * ### DailyTab
 *
 * One day at a time, in one column: the day's meetings,
 * then the plan (with what was carried over), then the to-dos checked off
 * (add something done on any day up to today, or pick it from the pull
 * requests, Linear issues and sessions your tools saw that day, folded under
 * it). Below, folded: suggestions to plan
 * from (someday to-dos, review requests and urgent issues from the Inbox) and
 * the next workday. "Wrap up" moves what is left to the next workday; "Copy
 * standup" copies the Daily Scrum update. `[`/`]` change the day; rows take
 * the to-do shortcuts (see `useTodoKeys`), listed under the keyboard icon.
 * A delete waits a few seconds with Undo (or `z`), as in the to-do list.
 */
export function DailyTab() {
  const t = useT();
  const { dayName, dayInText, shortDate } = useDayNames();
  const workbench = useWorkbenchActions();
  const now = useNow(CLOCK_TICK_MS);
  const { fetched, add, update, remove } = useTodos();
  const { failure, setFailure, run } = useTodoRun();
  const deletion = usePendingDelete(remove, setFailure);
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [wrapping, setWrapping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const today = now === 0 ? undefined : localDay(now);
  const day = picked ?? today;
  const activity = useJson<DayActivity>(day === undefined ? undefined : `/api/todos/daily?day=${day}`, { refreshOnReload: true, remember: true });
  const inbox = useJson<InboxView>(day !== undefined && day === today ? "/api/inbox" : undefined, { remember: true });

  const change = useCallback((id: string, next: TodoChange) => void run(update(id, next)), [run, update]);
  const todos = (fetched.data ?? []).filter((todo) => todo.id !== deletion.pending?.id);
  const rowKeys = useTodoKeys(fetched.data === undefined ? undefined : todos, today ?? "", change);

  if (today === undefined || day === undefined) return null;

  const items = activity.data?.day === day ? activity.data.items : [];
  const view = dailyView(todos, items, inbox.data?.items ?? [], day, today);
  const { isToday, isPast, next, plan, nextPlan } = view;
  const suggestionCount = view.inboxSuggestions.length + view.somedaySuggestions.length;

  function copyStandup() {
    // Rejected when the document has no focus (the c key right after switching windows) or permission is denied.
    void navigator.clipboard.writeText(view.standup).then(
      () => {
        setFailure(undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      },
      () => setFailure(t("daily.copyFailed")),
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    rowKeys(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("input, textarea, select") !== null) return;
    const key = todoKey(event.nativeEvent);
    if (key === "previousDay") setPicked(addDays(day!, -1));
    else if (key === "nextDay") setPicked(addDays(day!, 1));
    else if (key === "copyStandup") copyStandup();
    else if (key === "undo" && deletion.pending !== undefined) deletion.undo();
    else return;
    event.preventDefault();
  }

  function row(todo: Todo) {
    return (
      <TodoRow
        key={todo.id}
        todo={todo}
        today={today!}
        onChange={(next) => change(todo.id, next)}
        onOpen={(pin) => workbench.open(todoTab(todo), { preview: !pin })}
        onRemove={() => deletion.start(todo)}
      />
    );
  }

  const openMeeting = (m: ActivityItem) => workbench.open({ kind: "event", eventId: m.eventId ?? "", title: m.title }, { preview: true });
  const problems = activity.data?.problems ?? [];

  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto" onKeyDown={onKeyDown}>
      <article className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-center gap-1">
          <button type="button" className={ICON_BUTTON} aria-label={t("daily.previousDay")} title={t("daily.previousDayTitle")} onClick={() => setPicked(addDays(day, -1))}>
            <ChevronLeft size={15} />
          </button>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{shortDate(day)}</h1>
          <button type="button" className={ICON_BUTTON} aria-label={t("daily.nextDay")} title={t("daily.nextDayTitle")} onClick={() => setPicked(addDays(day, 1))}>
            <ChevronRight size={15} />
          </button>
          {isToday ? (
            <span className="ml-1 text-sm text-zinc-500">{t("todos.today")}</span>
          ) : (
            <button type="button" className={`${TEXT_BUTTON} ml-1`} onClick={() => setPicked(undefined)} title={t("daily.backToToday")}>
              {dayName(day, today) !== shortDate(day) ? `${dayName(day, today)} · ` : ""}
              {t("daily.backToToday")}
            </button>
          )}
          {/* Kept whole: on a narrow tab the actions move to their own line rather than squeezing their labels. */}
          <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
            <button type="button" className={ICON_BUTTON} disabled={activity.loading} onClick={activity.reload} aria-label={t("daily.reloadActivity")} title={t("daily.reloadActivityTitle")}>
              <RefreshCw size={13} className={activity.loading ? "animate-spin" : undefined} />
            </button>
            <span className={ICON_BUTTON} role="img" aria-label={t("daily.shortcuts")} title={t("daily.shortcuts")}>
              <Keyboard size={13} />
            </span>
            <button type="button" className={SECONDARY_BUTTON} onClick={copyStandup} title={t("daily.copyStandupTitle", { standup: view.standup })}>
              {copied ? <Check size={12} aria-hidden /> : <ClipboardCopy size={12} aria-hidden />}
              {copied ? t("daily.copied") : t("daily.copyStandup")}
            </button>
            {isToday && (
              <button type="button" className={SECONDARY_BUTTON} aria-pressed={wrapping} onClick={() => setWrapping((shown) => !shown)} title={t("daily.wrapUpTitle")}>
                <Moon size={12} aria-hidden />
                {t("daily.wrapUp")}
              </button>
            )}
          </span>
        </header>

        {failure !== undefined && <p className="text-xs text-red-600 dark:text-red-400">{failure}</p>}
        {fetched.data === undefined && <p className={DAILY_NOTE}>{fetched.error ?? t("todos.reading")}</p>}

        {isToday && wrapping && <WrapUpPanel plan={plan} next={next} today={today} onChange={change} onClose={() => setWrapping(false)} />}

        <MeetingList meetings={view.meetings} now={now} onOpen={openMeeting} />

        {!isPast && (
          <Section title={t("daily.plan")} count={plan.length}>
            <ul>{plan.map(row)}</ul>
            {plan.length > PLAN_LIMIT && <p className={DAILY_NOTE}>{t("daily.tooMany", { count: plan.length })}</p>}
            <AddTodo placeholder={isToday ? t("todos.addForToday") : t("daily.addFor", { day: dayInText(day, today) })} onAdd={(text) => run(add({ text, plannedFor: day }))} />
          </Section>
        )}

        {!(day > today) && (
          <Section title={t("daily.done")} count={view.done.length}>
            <ul>
              {view.done.map((todo) => (
                <DoneRow key={todo.id} todo={todo} expanded={expanded.has(todo.id)} onToggle={() => toggleExpanded(todo.id)} onRemove={() => deletion.start(todo)} />
              ))}
            </ul>
            <InlineAdd label={isToday ? t("daily.addDid") : t("daily.addDidOn", { date: shortDate(day) })} placeholder={t("daily.whatDid")} onAdd={(text) => run(add({ text, doneOn: day }))} />
            <ActivitySuggestions items={view.fromTools} onAdd={(item) => void run(add({ text: item.title.slice(0, TODO_TITLE_MAX), body: item.url ?? "", doneOn: day, doneAt: item.at }))} />
            {problems.length > 0 && (
              <p className={DAILY_NOTE} title={problems.map((p) => `${SOURCE_NAME[p.source](t)}: ${p.message}`).join("\n")}>
                {t("daily.couldntRead", { sources: problems.map((p) => SOURCE_NAME[p.source](t)).join(", ") })}
              </p>
            )}
          </Section>
        )}

        {(suggestionCount > 0 || isToday) && (
          <div className="flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {suggestionCount > 0 && (
              <Disclosure title={t("daily.suggestions")} count={suggestionCount}>
                {view.somedaySuggestions.length > 0 && (
                  <SuggestionGroup title={t("todos.someday")} count={view.somedaySuggestions.length}>
                    {(limit) => <ul>{view.somedaySuggestions.slice(0, limit).map(row)}</ul>}
                  </SuggestionGroup>
                )}
                {Object.entries(SUGGESTION_SOURCES).map(([source, look]) => {
                  const group = view.inboxSuggestions.filter((i) => i.source === source);
                  return group.length === 0 ? null : (
                    <SuggestionGroup key={source} title={look.label} icon={look.icon} count={group.length}>
                      {(limit) => (
                        <ul>
                          {group.slice(0, limit).map((item) => (
                            <InboxSuggestionRow
                              key={item.id}
                              item={item}
                              dayLabel={dayName(day, today)}
                              dayTitle={t("daily.addAsTodoFor", { day: dayInText(day, today) })}
                              onAdd={(link) => void run(add({ text: item.title.slice(0, TODO_TITLE_MAX), body: link, plannedFor: day }))}
                            />
                          ))}
                        </ul>
                      )}
                    </SuggestionGroup>
                  );
                })}
              </Disclosure>
            )}
            {isToday &&
              (nextPlan.length === 0 ? (
                <InlineAdd label={t("daily.planDay", { day: dayInText(next, today) })} placeholder={t("daily.addFor", { day: dayInText(next, today) })} onAdd={(text) => run(add({ text, plannedFor: next }))} />
              ) : (
                <Disclosure title={dayName(next, today)} count={nextPlan.length}>
                  <ul>{nextPlan.map(row)}</ul>
                  <InlineAdd label={t("daily.add")} placeholder={t("daily.addFor", { day: dayInText(next, today) })} onAdd={(text) => run(add({ text, plannedFor: next }))} />
                </Disclosure>
              ))}
          </div>
        )}
      </article>
      <div className="sticky bottom-3 mx-auto max-w-2xl px-6">
        <UndoDeleteBar deletion={deletion} />
      </div>
    </div>
  );
}
