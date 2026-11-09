"use client";

import { Bot, CalendarDays, CircleCheck, GitMerge, GitPullRequest, NotebookPen, PenLine, Plus, SquareArrowOutUpRight, SquareKanban, X, type LucideIcon } from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import { todoTab } from "@/shell/todos";
import type { Tab } from "@/shell/tabs";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { Markdown } from "@/shell/Markdown";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { ROW_HOVER, SELECTED_ROW } from "@/ui/selection";
import { GitHubIcon, LinearIcon, SlackIcon, type BrandIconProps } from "@/ui/brandIcons";
import { HIDE_ON_HOVER, REVEAL_ON_HOVER } from "@/ui/hoverReveal";
import type { MessageKey } from "@/ui/i18n/messages";
import { useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";
import type { InboxItem, InboxSource } from "@/features/inbox/model/Inbox";
import { keepLineBreaks, type ActivityItem, type ActivityKind } from "@/features/todos/model/Daily";
import { doneTimeKnown, type Todo } from "@/features/todos/model/Todos";
import { Disclosure, Section, TEXT_BUTTON, TIME_COLUMN, useTime } from "@/features/todos/ui/dailyLayout";
import { inboxReasonText } from "@/shell/inboxReasonText";

/** Suggestions shown per group before "Show more". */
const SUGGESTION_LIMIT = 5;

const ACTIVITY_LOOK: Record<ActivityKind, { icon: LucideIcon; label: Extract<MessageKey, `daily.activity.${string}`> }> = {
  "pr-merged": { icon: GitMerge, label: "daily.activity.merged" },
  "pr-opened": { icon: GitPullRequest, label: "daily.activity.prOpened" },
  "linear-done": { icon: SquareKanban, label: "daily.activity.linearDone" },
  session: { icon: Bot, label: "daily.activity.session" },
  meeting: { icon: CalendarDays, label: "daily.activity.meeting" },
};

/** The tab an activity opens in mothership, when there is one; otherwise its page in the browser. */
function activityTab(item: ActivityItem): Tab | undefined {
  if (item.agentId !== undefined) return { kind: "session", agentId: item.agentId };
  if (item.eventId !== undefined) return { kind: "event", eventId: item.eventId, title: item.title };
  const pr = item.url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (pr !== null && pr !== undefined) return { kind: "pr", repo: pr[1]!, number: Number(pr[2]) };
  return undefined;
}

/** A link to keep in a to-do made from an Inbox item, so its notes lead back to it. */
function inboxLink(item: InboxItem): string {
  switch (item.open.kind) {
    case "pr":
      return `https://github.com/${item.open.repo}/pull/${item.open.number}`;
    case "slack":
    case "url":
      return item.open.url;
    default:
      return "";
  }
}

/**
 * ### MeetingList
 *
 * The day's meetings, one per row in the Done list's columns: time, title, then where. Past ones are muted; each opens its event.
 */
export function MeetingList({ meetings, now, onOpen }: { meetings: Array<ActivityItem>; now: number; onOpen: (meeting: ActivityItem) => void }) {
  const t = useT();
  const time = useTime();
  if (meetings.length === 0) return null;
  return (
    <Section title={t("daily.meetings")} count={meetings.length}>
      <ul>
        {meetings.map((m) => {
          const past = (m.end ?? m.at) <= now;
          const title = itemTitle(t, m.title);
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onOpen(m)}
                title={m.detail === undefined ? title : `${title} · ${m.detail}`}
                className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-teal-500 ${ROW_HOVER} ${past ? "text-zinc-400 dark:text-zinc-600" : ""}`}
              >
                <span className={`${TIME_COLUMN} text-zinc-500`}>{time(m.at)}</span>
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {m.detail !== undefined && <span className="hidden max-w-[35%] shrink-0 truncate text-[11px] text-zinc-500 @lg:inline">{m.detail}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/**
 * ### SUGGESTION_SOURCES
 *
 * How each Inbox source the Daily tab suggests from is labelled.
 */
export const SUGGESTION_SOURCES: Partial<Record<InboxSource, { label: string; icon: ComponentType<BrandIconProps> }>> = {
  github: { label: "GitHub", icon: GitHubIcon },
  linear: { label: "Linear", icon: LinearIcon },
};

/**
 * ### SuggestionGroup
 *
 * Suggestions grouped by where they come from, each group showing a few until asked for more.
 */
export function SuggestionGroup({ title, icon: Icon, count, children }: { title: string; icon?: ComponentType<BrandIconProps>; count: number; children: (limit: number) => ReactNode }) {
  const t = useT();
  const [all, setAll] = useState(false);
  return (
    <div className="flex flex-col">
      <div className="flex h-6 items-center gap-1.5 px-2 text-[11px] text-zinc-400 dark:text-zinc-600">
        {Icon !== undefined && <Icon size={11} aria-hidden />}
        {title}
      </div>
      {children(all ? count : SUGGESTION_LIMIT)}
      {count > SUGGESTION_LIMIT && !all && (
        <button type="button" className={TEXT_BUTTON} onClick={() => setAll(true)}>
          {t("daily.showMore", { count: count - SUGGESTION_LIMIT })}
        </button>
      )}
    </div>
  );
}

/** Where a done to-do without a real time came from, in place of the time. */
function DayOnlyMark({ todo }: { todo: Todo | undefined }) {
  const t = useT();
  if (todo?.source?.kind === "slack-scrum") {
    return (
      <span className="flex items-center gap-1" title={todo.source.inferred ? t("daily.scrumInferred") : t("daily.scrumFrom")}>
        <SlackIcon size={11} aria-hidden />
        {todo.source.inferred && <span className="text-[10px] text-amber-600 dark:text-amber-400">{t("daily.inferred")}</span>}
      </span>
    );
  }
  return (
    <span title={t("daily.addedAsDone")}>
      <PenLine size={11} aria-label={t("daily.addedAsDone")} />
    </span>
  );
}

/** A done to-do opened in place: its notes, and links to where it came from and to its own tab. */
function DoneDetails({ todo }: { todo: Todo }) {
  const t = useT();
  const workbench = useWorkbenchActions();
  const source = todo.source;
  return (
    <div className="mb-1 ml-14 mr-2 flex flex-col gap-1.5 border-l border-zinc-200 pl-3 text-[13px] dark:border-zinc-800">
      {todo.body.trim() !== "" && todo.body.trim() !== todo.text && (
        <div className="min-w-0 break-words text-zinc-700 dark:text-zinc-300">
          <Markdown>{keepLineBreaks(todo.body)}</Markdown>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <button type="button" className="flex items-center gap-1 text-teal-700 hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-300" onClick={() => workbench.open(todoTab(todo), { preview: true })}>
          <SquareArrowOutUpRight size={11} aria-hidden /> {t("daily.openTodo")}
        </button>
        {source?.kind === "slack-scrum" && (
          <button type="button" className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => workbench.open({ kind: "slack", url: source.url, title: "Daily Scrum" }, { preview: true })}>
            <SlackIcon size={11} aria-hidden /> {t("daily.openInSlack")}
          </button>
        )}
        {source?.kind === "meeting" && (
          <button type="button" className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => workbench.open({ kind: "meeting", itemId: source.itemId, title: source.title })}>
            <NotebookPen size={11} aria-hidden /> {itemTitle(t, source.title)}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * ### DoneRow
 *
 * A done to-do in the Done list; its title wraps to two lines and it opens its details in place.
 */
export function DoneRow({ todo, expanded, onToggle, onRemove }: { todo: Todo; expanded: boolean; onToggle: () => void; onRemove: () => void }) {
  const t = useT();
  const time = useTime();
  const workbench = useWorkbenchActions();
  return (
    <li className="group relative">
      <button
        type="button"
        title={todo.text}
        aria-expanded={expanded}
        onClick={onToggle}
        // Room on the right for the row's buttons, so revealing them never moves the text.
        className={`flex min-h-7 w-full items-start gap-2 rounded-md py-1 pl-2 pr-14 text-left text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-teal-500 ${expanded ? SELECTED_ROW : ROW_HOVER}`}
      >
        <span className={`flex h-5 items-center ${TIME_COLUMN} text-zinc-500`}>
          {doneTimeKnown(todo) && todo.doneAt !== undefined ? time(todo.doneAt) : <DayOnlyMark todo={todo} />}
        </span>
        <CircleCheck size={13} aria-label={t("daily.todo")} className="mt-[3px] shrink-0 text-zinc-500" />
        <span className="line-clamp-2 min-w-0 flex-1 leading-5 break-words">{todo.text}</span>
      </button>
      <span className={`absolute right-1.5 top-1 items-center ${expanded ? "flex" : REVEAL_ON_HOVER}`}>
        <button type="button" aria-label={t("daily.openTodoNamed", { text: todo.text })} title={t("daily.openTodo")} className={ICON_BUTTON} onClick={() => workbench.open(todoTab(todo), { preview: true })}>
          <SquareArrowOutUpRight size={12} />
        </button>
        <button type="button" aria-label={t("todos.deleteNamed", { text: todo.text })} title={t("todos.delete")} className={ICON_BUTTON} onClick={onRemove}>
          <X size={12} />
        </button>
      </span>
      {expanded && <DoneDetails todo={todo} />}
    </li>
  );
}

/**
 * ### ActivitySuggestions
 *
 * What your tools say you did on the day that is not a to-do yet (sessions, pull requests, Linear issues), folded under Done: each opens where it lives, or is added as a done to-do at the time it happened.
 */
export function ActivitySuggestions({ items, onAdd }: { items: Array<ActivityItem>; onAdd: (item: ActivityItem) => void }) {
  const t = useT();
  const time = useTime();
  const workbench = useWorkbenchActions();
  if (items.length === 0) return null;
  return (
    <Disclosure title={t("daily.fromTools")} count={items.length}>
      <ul>
        {items.map((item) => {
          const { icon: Icon, label } = ACTIVITY_LOOK[item.kind];
          const tab = activityTab(item);
          const url = item.url;
          const open = tab !== undefined ? () => workbench.open(tab, { preview: true }) : url !== undefined ? () => window.open(url, "_blank", "noopener") : undefined;
          return (
            <li key={item.id} className={`group flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-zinc-500 ${ROW_HOVER}`}>
              <span className={TIME_COLUMN}>{time(item.at)}</span>
              <Icon size={13} aria-label={t(label)} className="shrink-0" />
              {open === undefined ? (
                <span className="min-w-0 flex-1 truncate" title={item.title}>
                  {item.title}
                </span>
              ) : (
                <button type="button" onClick={open} title={item.title} className="min-w-0 flex-1 truncate rounded-sm text-left outline-none hover:text-zinc-900 focus-visible:ring-1 focus-visible:ring-teal-500 dark:hover:text-zinc-100">
                  {item.title}
                </button>
              )}
              {item.detail !== undefined && <span className={`max-w-[30%] shrink-0 truncate text-[11px] text-zinc-400 dark:text-zinc-600 ${HIDE_ON_HOVER}`}>{item.detail}</span>}
              <button type="button" className={`${TEXT_BUTTON} h-6 ${REVEAL_ON_HOVER}`} title={t("daily.addToDone")} onClick={() => onAdd(item)}>
                <Plus size={12} aria-hidden /> {t("daily.addDone")}
              </button>
            </li>
          );
        })}
      </ul>
    </Disclosure>
  );
}

/**
 * ### InboxSuggestionRow
 *
 * An Inbox item offered as a to-do for the day shown.
 *
 * @param dayLabel - The day as a button label, e.g. "Today".
 * @param dayTitle - The button's title, e.g. "Add as a to-do for today".
 */
export function InboxSuggestionRow({ item, dayLabel, dayTitle, onAdd }: { item: InboxItem; dayLabel: string; dayTitle: string; onAdd: (link: string) => void }) {
  const t = useT();
  return (
    <li className={`group flex h-7 items-center gap-2 rounded-md px-2 text-[13px] ${ROW_HOVER}`}>
      <span className="min-w-0 flex-1 truncate" title={`${item.title} · ${inboxReasonText(t, item)}`}>
        {item.title}
      </span>
      <span className={`max-w-[30%] shrink-0 truncate text-[11px] text-zinc-400 dark:text-zinc-600 ${HIDE_ON_HOVER}`}>{inboxReasonText(t, item)}</span>
      <button type="button" className={`${TEXT_BUTTON} h-6 ${REVEAL_ON_HOVER}`} title={dayTitle} onClick={() => onAdd(inboxLink(item))}>
        <Plus size={12} aria-hidden /> {dayLabel}
      </button>
    </li>
  );
}
