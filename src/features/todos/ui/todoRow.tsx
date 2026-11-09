"use client";

import { ArrowRight, CalendarDays, OctagonAlert, Sun, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { HIDE_ON_HOVER, KEEP_REVEALED, REVEAL_ON_HOVER } from "@/ui/hoverReveal";
import { ROW_HOVER } from "@/ui/selection";
import { nextWorkday, planDay } from "@/features/todos/model/Daily";
import { addDays } from "@/lib/dates";
import type { Todo, TodoChange } from "@/features/todos/model/Todos";
import { TodoSessionButton, TodoSessionStatus, useTodoSession } from "@/features/todos/ui/todoSession";
import type { Translate } from "@/ui/i18n/translate";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";

/**
 * ### shortDate
 *
 * @param dateLocale - The `Intl` locale, e.g. from `useFormat().dateLocale`.
 * @returns `day` (`YYYY-MM-DD`) as a short local date with its weekday, e.g. "Mon, Nov 23".
 */
export function shortDate(day: string, dateLocale: string): string {
  // Noon, so a time zone shift never moves it to another day.
  return new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale, { month: "short", day: "numeric", weekday: "short" });
}

/**
 * ### dayName
 *
 * @returns "Today", "Tomorrow", "Yesterday", or the short date of `day`, in the language of `t`.
 */
export function dayName(day: string, today: string, t: Translate, dateLocale: string): string {
  if (day === today) return t("todos.today");
  if (day === addDays(today, 1)) return t("todos.tomorrow");
  if (day === addDays(today, -1)) return t("todos.yesterday");
  return shortDate(day, dateLocale);
}

/**
 * ### dayInText
 *
 * {@link dayName} as it reads inside a sentence ("Add a to-do for
 * tomorrow"): the relative words in their in-text form, a date as it is.
 */
export function dayInText(day: string, today: string, t: Translate, dateLocale: string): string {
  if (day === today) return t("todos.todayInText");
  if (day === addDays(today, 1)) return t("todos.tomorrowInText");
  if (day === addDays(today, -1)) return t("todos.yesterdayInText");
  return shortDate(day, dateLocale);
}

/**
 * ### useDayNames
 *
 * {@link shortDate}, {@link dayName}, and {@link dayInText} bound to the chosen language.
 */
export function useDayNames(): { shortDate: (day: string) => string; dayName: (day: string, today: string) => string; dayInText: (day: string, today: string) => string } {
  const t = useT();
  const { dateLocale } = useFormat();
  return useMemo(
    () => ({
      shortDate: (day: string) => shortDate(day, dateLocale),
      dayName: (day: string, today: string) => dayName(day, today, t, dateLocale),
      dayInText: (day: string, today: string) => dayInText(day, today, t, dateLocale),
    }),
    [t, dateLocale],
  );
}

/** How a due date reads next to a to-do, and whether it is late. */
function dueLabel(due: string, today: string, t: Translate, dateLocale: string): { text: string; tone: "late" | "today" | "later" } {
  if (due < today) return { text: shortDate(due, dateLocale), tone: "late" };
  if (due === today) return { text: t("todos.dueToday"), tone: "today" };
  return { text: dayName(due, today, t, dateLocale), tone: "later" };
}

const TONE = {
  late: "text-red-600 dark:text-red-400",
  today: "text-amber-600 dark:text-amber-400",
  later: "text-zinc-500",
};

/**
 * ### DueButton
 *
 * A date picker behind an icon button; picking calls `onPick` (`null` when cleared).
 *
 * The hidden input takes focus while its picker is open, so a hover-revealed
 * row stays revealed (see {@link KEEP_REVEALED}) as the pointer moves onto the
 * picker; picking a date or Escape gives the focus back, clicking elsewhere
 * takes it.
 */
export function DueButton({ due, onPick }: { due: string | undefined; onPick: (due: string | null) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const label = due === undefined ? t("todos.setDue") : t("todos.changeDue");
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        className={ICON_BUTTON}
        onClick={() => {
          input.current?.focus();
          input.current?.showPicker();
        }}
      >
        <CalendarDays size={12} />
      </button>
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-hidden
        {...KEEP_REVEALED}
        value={due ?? ""}
        onChange={(event) => {
          event.target.blur();
          onPick(event.target.value === "" ? null : event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        className="pointer-events-none absolute right-0 top-full h-0 w-0 opacity-0"
      />
    </span>
  );
}

/**
 * ### TODO_ROW_ATTRIBUTE
 *
 * Data attribute on each row's title button, holding the to-do id, so keyboard
 * shortcuts can find the focused to-do and move between rows.
 */
export const TODO_ROW_ATTRIBUTE = "data-todo-row";

/**
 * ### TodoRow
 *
 * One to-do on one line: checkbox, title, marks (put off N times, blocked,
 * session), and its date; hover swaps the date for actions: move it to
 * today or the next workday, start its session, set a due date, delete.
 */
export function TodoRow({
  todo,
  today,
  onChange,
  onOpen,
  onRemove,
}: {
  todo: Todo;
  /** Local today, `YYYY-MM-DD`. */
  today: string;
  onChange: (change: TodoChange) => void;
  /** Opens the to-do's tab; `pin` keeps it (a double click), else it is a preview. */
  onOpen: (pin: boolean) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { dateLocale } = useFormat();
  const due = todo.due === undefined || todo.done ? undefined : dueLabel(todo.due, today, t, dateLocale);
  const putOff = t(todo.carryCount === 1 ? "todos.putOff.one" : "todos.putOff.other", { count: todo.carryCount });
  const { state } = useTodoSession(todo);
  const onToday = !todo.done && planDay(todo, today) === today;
  const next = nextWorkday(today);
  const nextName = dayName(next, today, t, dateLocale);
  // The row's single-key shortcuts (see `useTodoKeys`) go in its tooltip, so they can be found.
  return (
    <li className={`group flex h-7 items-center gap-2 rounded-md px-2 ${ROW_HOVER}`}>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => onChange({ done: !todo.done })}
        aria-label={todo.done ? t("todos.markNotDone", { text: todo.text }) : t("todos.markDone", { text: todo.text })}
        className={`size-3.5 shrink-0 accent-teal-600 ${todo.done ? "opacity-50" : ""}`}
      />
      <button
        type="button"
        title={`${todo.text}\n${todo.done ? t("todos.rowKeysDone") : t("todos.rowKeys")}`}
        {...{ [TODO_ROW_ATTRIBUTE]: todo.id }}
        aria-keyshortcuts="x t m s b"
        onClick={() => onOpen(false)}
        onDoubleClick={() => onOpen(true)}
        className={`min-w-0 flex-1 truncate rounded-sm text-left text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-teal-500 ${todo.done ? "text-zinc-500 line-through" : ""}`}
      >
        {todo.text}
      </button>
      {!todo.done && todo.blocked && (
        <span title={t("todos.blocked")} role="img" aria-label={t("todos.blocked")} className="shrink-0 text-red-600 dark:text-red-400">
          <OctagonAlert size={12} aria-hidden />
        </span>
      )}
      {!todo.done && todo.carryCount > 0 && (
        <span
          title={putOff}
          role="img"
          aria-label={putOff}
          className={`shrink-0 text-[11px] tabular-nums ${todo.carryCount >= 3 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
          <span aria-hidden>↻{todo.carryCount}</span>
        </span>
      )}
      <TodoSessionStatus state={state} />
      {due !== undefined && (
        <span className={`shrink-0 text-[11px] ${HIDE_ON_HOVER} ${TONE[due.tone]}`} title={todo.due}>
          {due.text}
        </span>
      )}
      <span className={`shrink-0 items-center ${REVEAL_ON_HOVER}`}>
        {!todo.done &&
          (onToday ? (
            <button type="button" aria-label={t("todos.moveTo", { day: nextName })} title={t("todos.moveToTitle", { day: nextName })} className={ICON_BUTTON} onClick={() => onChange({ plannedFor: next })}>
              <ArrowRight size={12} />
            </button>
          ) : (
            <button type="button" aria-label={t("todos.doToday")} title={t("todos.doTodayTitle")} className={ICON_BUTTON} onClick={() => onChange({ plannedFor: today })}>
              <Sun size={12} />
            </button>
          ))}
        <TodoSessionButton todo={todo} compact />
        {!todo.done && <DueButton due={todo.due} onPick={(next) => onChange({ due: next })} />}
        <button type="button" aria-label={t("todos.deleteNamed", { text: todo.text })} title={t("todos.delete")} className={ICON_BUTTON} onClick={onRemove}>
          <X size={12} />
        </button>
      </span>
    </li>
  );
}
