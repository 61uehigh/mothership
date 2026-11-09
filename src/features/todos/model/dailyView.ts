import type { InboxItem, InboxSource } from "@/features/inbox/model/Inbox";
import { bucketTodos, doneSuggestions, nextWorkday, planDay, previousWorkday, standupText, type ActivityItem } from "@/features/todos/model/Daily";
import type { Todo } from "@/features/todos/model/Todos";
import { localDay } from "@/lib/dates";

/**
 * ### SUGGESTED_INBOX_SOURCES
 *
 * The Inbox sources the Daily tab suggests planning from: work items only.
 * A review request or an urgent issue is a to-do; a DM or a meeting is not.
 */
export const SUGGESTED_INBOX_SOURCES: ReadonlyArray<InboxSource> = ["github", "linear"];

/**
 * ### DailyView
 *
 * Everything the Daily tab shows for one day, worked out from your to-dos,
 * what your tools saw that day, and the Inbox.
 */
export type DailyView = {
  isToday: boolean;
  /** Before today: there is no plan to show or add to, only what was done. */
  isPast: boolean;
  /** The workday after the day shown; Wrap up moves what is left there. */
  next: string;
  /** Open to-dos planned for the day (today's carry-overs included). */
  plan: Array<Todo>;
  /** Open to-dos planned for {@link DailyView.next}. */
  nextPlan: Array<Todo>;
  meetings: Array<ActivityItem>;
  /** To-dos checked off that day, in the order they were done. */
  done: Array<Todo>;
  /** What the tools saw you do that day that is not a to-do yet. */
  fromTools: Array<ActivityItem>;
  /** Today's work items from the Inbox not already an open to-do; only for today. */
  inboxSuggestions: Array<InboxItem>;
  /** Someday to-dos to plan from; none for a past day. */
  somedaySuggestions: Array<Todo>;
  /** The Daily Scrum update for today: done yesterday (the previous workday), today's plan, blocked. */
  standup: string;
};

/**
 * ### dailyView
 *
 * @param items - What the tools saw on `day` (sessions, pull requests, Linear issues, meetings).
 * @param inbox - The Inbox's items; used only when `day` is today.
 * @param day - The day shown, `YYYY-MM-DD`.
 * @param today - Today's local date.
 */
export function dailyView(todos: Array<Todo>, items: Array<ActivityItem>, inbox: Array<InboxItem>, day: string, today: string): DailyView {
  const buckets = bucketTodos(todos, today);
  const isToday = day === today;
  const isPast = day < today;
  const next = nextWorkday(day);
  const open = todos.filter((todo) => !todo.done);
  const doneOn = (date: string) => todos.filter((todo) => todo.done && todo.doneAt !== undefined && localDay(todo.doneAt) === date);
  const openTitles = new Set(open.map((todo) => todo.text));
  return {
    isToday,
    isPast,
    next,
    plan: isToday ? buckets.today : open.filter((todo) => planDay(todo, today) === day),
    nextPlan: open.filter((todo) => planDay(todo, today) === next),
    meetings: items.filter((item) => item.kind === "meeting"),
    done: doneOn(day).sort((a, b) => a.doneAt! - b.doneAt!),
    fromTools: doneSuggestions(items, new Set(todos.map((todo) => todo.text))),
    inboxSuggestions: isToday ? inbox.filter((item) => item.bucket === "today" && SUGGESTED_INBOX_SOURCES.includes(item.source) && !openTitles.has(item.title)) : [],
    somedaySuggestions: isPast ? [] : buckets.someday,
    standup: standupText({ doneYesterday: doneOn(previousWorkday(today)), today: buckets.today, blocked: open.filter((todo) => todo.blocked) }),
  };
}
