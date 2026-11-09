import { KOREAN_HOLIDAYS } from "@/features/todos/model/koreanHolidays";
import { addDays, localDay, noonUtc } from "@/lib/dates";
import type { Todo } from "@/features/todos/model/Todos";

function isDayOff(day: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(noonUtc(day)).getUTCDay();
  return weekday === 0 || weekday === 6 || holidays.has(day);
}

/**
 * ### nextWorkday
 *
 * The day "tomorrow" means at work: Friday's tomorrow is Monday, and
 * holidays are skipped the way the Daily Scrum import skips them.
 *
 * @param holidays - `YYYY-MM-DD` days off besides weekends; Korea's public holidays by default.
 */
export function nextWorkday(day: string, holidays: ReadonlySet<string> = KOREAN_HOLIDAYS): string {
  let next = addDays(day, 1);
  while (isDayOff(next, holidays)) next = addDays(next, 1);
  return next;
}

/**
 * ### previousWorkday
 *
 * The day "yesterday" means in a standup: Monday's yesterday is Friday, and
 * the day after 추석 looks back past the holidays.
 *
 * @param holidays - `YYYY-MM-DD` days off besides weekends; Korea's public holidays by default.
 */
export function previousWorkday(day: string, holidays: ReadonlySet<string> = KOREAN_HOLIDAYS): string {
  let previous = addDays(day, -1);
  while (isDayOff(previous, holidays)) previous = addDays(previous, -1);
  return previous;
}

/**
 * ### planDay
 *
 * The day an open to-do is on your plan. A plan from a day already past
 * counts as today (it is carried over); a to-do without a plan but due
 * today or earlier is today; otherwise it is on its due date, or on no day.
 *
 * @returns `YYYY-MM-DD`, or `undefined` for "someday".
 */
export function planDay(todo: Pick<Todo, "plannedFor" | "due">, today: string): string | undefined {
  if (todo.plannedFor !== undefined) return todo.plannedFor < today ? today : todo.plannedFor;
  if (todo.due !== undefined) return todo.due < today ? today : todo.due;
  return undefined;
}

/**
 * ### TodoBuckets
 *
 * The to-do list cut by day, as the sidebar and the Daily tab show it.
 */
export type TodoBuckets = {
  today: Array<Todo>;
  /** On the next workday (see {@link nextWorkday}). */
  next: Array<Todo>;
  /** Further ahead, soonest first; between today and the next workday (a weekend) counts here too. */
  later: Array<Todo>;
  /** No day: neither planned nor due. */
  someday: Array<Todo>;
  /** Checked off today. */
  doneToday: Array<Todo>;
  /** Checked off before today. */
  doneEarlier: Array<Todo>;
};

/**
 * ### bucketTodos
 *
 * Sorts every to-do into one bucket of {@link TodoBuckets}, keeping the order of `todos`
 * (Later goes by day).
 *
 * @param today - Local today, `YYYY-MM-DD`.
 */
export function bucketTodos(todos: Array<Todo>, today: string): TodoBuckets {
  const buckets: TodoBuckets = { today: [], next: [], later: [], someday: [], doneToday: [], doneEarlier: [] };
  const next = nextWorkday(today);
  for (const todo of todos) {
    if (todo.done) {
      (todo.doneAt !== undefined && localDay(todo.doneAt) === today ? buckets.doneToday : buckets.doneEarlier).push(todo);
      continue;
    }
    const day = planDay(todo, today);
    if (day === undefined) buckets.someday.push(todo);
    else if (day === today) buckets.today.push(todo);
    else if (day === next) buckets.next.push(todo);
    else buckets.later.push(todo);
  }
  // Later reads by date; to-dos on the same day keep their order.
  buckets.later.sort((a, b) => planDay(a, today)!.localeCompare(planDay(b, today)!));
  return buckets;
}

/**
 * ### replan
 *
 * Moves a to-do to another day. Pushing an open to-do that was meant for
 * today or earlier to a later day counts once more in `carryCount`, so the
 * ones you keep putting off stand out; planning ahead does not count.
 *
 * @param day - The new day, or `null` for someday.
 * @returns The fields to save.
 */
export function replan(todo: Pick<Todo, "plannedFor" | "carryCount" | "done">, day: string | null, today: string): { plannedFor: string | undefined; carryCount: number } {
  const postponed = !todo.done && todo.plannedFor !== undefined && todo.plannedFor <= today && (day === null || day > todo.plannedFor);
  return { plannedFor: day ?? undefined, carryCount: todo.carryCount + (postponed ? 1 : 0) };
}

/**
 * ### rollOver
 *
 * Carries every open to-do planned for a day already past over to today
 * (each counts once in `carryCount`, however many days it sat).
 *
 * @returns The changed list, or `undefined` when nothing was carried.
 */
export function rollOver(todos: Array<Todo>, today: string): Array<Todo> | undefined {
  let changed = false;
  const next = todos.map((todo) => {
    if (todo.done || todo.plannedFor === undefined || todo.plannedFor >= today) return todo;
    changed = true;
    return { ...todo, ...replan(todo, today, today) };
  });
  return changed ? next : undefined;
}

/**
 * ### ActivityKind
 *
 * What kind of thing you did, gathered from your tools for the Daily tab.
 */
export type ActivityKind = "pr-opened" | "pr-merged" | "linear-done" | "session" | "meeting";

/**
 * ### ActivityItem
 *
 * One thing you did (or, for a meeting later today, will do) on a day, from
 * a tool rather than the to-do list.
 */
export type ActivityItem = {
  /** Unique within the day, e.g. `pr-merged:owner/repo#12`. */
  id: string;
  kind: ActivityKind;
  title: string;
  /** Short context: the repository, the issue identifier, the meeting's time. */
  detail: string | undefined;
  /** Epoch milliseconds it happened (a meeting's start). */
  at: number;
  /** A meeting's end, epoch milliseconds. */
  end?: number | undefined;
  url: string | undefined;
  /** The session, for `session` items. */
  agentId?: string | undefined;
  /** The calendar event, for `meeting` items. */
  eventId?: string | undefined;
};

/**
 * ### ActivitySource
 *
 * Where activity comes from; one failing does not hide the others.
 */
export type ActivitySource = "github" | "linear" | "sessions" | "calendar";

/**
 * ### DayActivity
 *
 * Everything your tools say you did on `day`, oldest first.
 */
export type DayActivity = {
  day: string;
  items: Array<ActivityItem>;
  problems: Array<{ source: ActivitySource; message: string }>;
};

/**
 * ### doneSuggestions
 *
 * What your tools say you did that is not on the to-do list yet, offered to
 * add as done rather than counted on its own: the to-do for it is usually
 * there already. Meetings, anything titled like an existing to-do, and a pull
 * request opened that also merged the same day (said once, as merged) are left out.
 *
 * @param titles - Every to-do's title.
 */
export function doneSuggestions(items: Array<ActivityItem>, titles: ReadonlySet<string>): Array<ActivityItem> {
  const merged = new Set(items.filter((a) => a.kind === "pr-merged").map((a) => a.url));
  return items.filter((a) => a.kind !== "meeting" && !titles.has(a.title) && !(a.kind === "pr-opened" && merged.has(a.url)));
}

/**
 * ### standupText
 *
 * The Daily Scrum update, ready to paste into Slack: the to-dos checked off
 * on the last workday, what is planned today, and the open to-dos marked
 * blocked. Slack's composer reads pasted text as Markdown, so headings use
 * `**` (a single `*` would turn italic), and a blank line comes before each
 * later heading: without it, Markdown reads the heading as the last list
 * item's continuation and glues it onto that item. The headings are
 * Korean in every UI language on purpose: the Daily Scrum channel is
 * Korean, and `parseScrumPost` reads these same headings back.
 */
export function standupText(input: { doneYesterday: Array<Todo>; today: Array<Todo>; blocked: Array<Todo> }): string {
  const list = (lines: Array<string>) => (lines.length === 0 ? ["- 없음"] : lines.map((line) => `- ${line}`));
  return [
    "**어제 한 일**",
    ...list(input.doneYesterday.map((t) => t.text)),
    "",
    "**오늘 할 일**",
    ...list(input.today.map((t) => t.text)),
    "",
    "**막힌 것**",
    ...list(input.blocked.map((t) => t.text)),
  ].join("\n");
}

const FENCE = /^\s*(```|~~~)/;

/**
 * ### keepLineBreaks
 *
 * A to-do's notes with each single line break kept as one in Markdown. Notes
 * are written line by line (an imported bullet's path, then the bullet).
 * Lines in a fenced code block are left as they are, so copied code has no
 * trailing spaces.
 */
export function keepLineBreaks(body: string): string {
  const lines = body.split("\n");
  let inFence = false;
  return lines
    .map((line, i) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return line;
      }
      const next = lines[i + 1];
      return inFence || line === "" || next === undefined || next === "" || FENCE.test(next) ? line : `${line}  `;
    })
    .join("\n");
}
