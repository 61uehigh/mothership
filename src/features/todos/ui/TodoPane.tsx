"use client";

import { ArrowUpRight, CalendarCheck, ChevronRight, History, SquarePen, X } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { PaneHeader, StackedSectionContext } from "@/shell/PaneHeader";
import { GroupHeader } from "@/ui/GroupHeader";
import { newTodoTab, todoTab } from "@/shell/todos";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { formatBinding } from "@/shell/commands/keys";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { useNow } from "@/ui/useNow";
import { bucketTodos, nextWorkday } from "@/features/todos/model/Daily";
import { localDay } from "@/lib/dates";
import type { Todo, TodoChange } from "@/features/todos/model/Todos";
import { AddTodo } from "@/features/todos/ui/AddTodo";
import { UndoDeleteBar, usePendingDelete } from "@/features/todos/ui/pendingDelete";
import { todoKey } from "@/features/todos/ui/todoKeys";
import { DueButton, TODO_ROW_ATTRIBUTE, TodoRow, useDayNames } from "@/features/todos/ui/todoRow";
import { useTodoRun } from "@/features/todos/ui/useTodoRun";
import { useTodoKeys } from "@/features/todos/ui/useTodoKeys";
import { useTodos } from "@/features/todos/ui/useTodos";
import { useT } from "@/ui/i18n/useT";

const CLOCK_TICK_MS = 60_000;

/** How long a row you just checked off stays where it was. */
const SETTLE_MS = 1_500;

/** Done-today rows shown under Today; earlier ones wait behind "Show N earlier done today". */
const DONE_SHOWN = 3;

/** A titled group of rows, with an optional note at the right of its title. */
function Group({ title, count, note, children }: { title: string; count: number; note?: string; children: ReactNode }) {
  return (
    <section className="mt-1">
      <GroupHeader title={title} count={count} note={note} />
      <ul>{children}</ul>
    </section>
  );
}

/**
 * ### TodoPane
 *
 * Your to-do list by day: Today (with what was carried over), the next
 * workday, later, and someday. What you check off today stays under Today,
 * muted at its end, until the day is over; what you finished before that
 * lives in the Daily tab, day by day, which the list's last line opens.
 * Enter adds a to-do
 * for today (with a due date if you like); + writes one with notes in its
 * own tab. Rows take the Daily tab's single-key shortcuts. Each to-do can
 * have one session.
 */
export function TodoPane() {
  const t = useT();
  const { dayName } = useDayNames();
  const workbench = useWorkbenchActions();
  const now = useNow(CLOCK_TICK_MS);
  const { fetched, add, update, remove } = useTodos();
  const [due, setDue] = useState("");
  const { failure, setFailure, run } = useTodoRun();
  // To-dos just checked or unchecked, placed as they were before for a beat.
  const [settling, setSettling] = useState<ReadonlyMap<string, Todo>>(new Map());
  const [allDone, setAllDone] = useState(false);
  const [announced, setAnnounced] = useState("");
  const deletion = usePendingDelete(remove, setFailure);
  const folded = useContext(StackedSectionContext)?.collapsed === true;
  const list = useRef<HTMLDivElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  // Deleting the last row leaves the keyboard nowhere in the list: Undo takes it once the bar is drawn.
  const focusUndo = useRef(false);
  useEffect(() => {
    if (deletion.pending === undefined || !focusUndo.current) return;
    focusUndo.current = false;
    undoButton.current?.focus();
  }, [deletion.pending]);
  /** The id of the row after `id` in this list (else before it), to take the keyboard when `id` moves or goes. */
  const neighbour = useCallback((id: string) => neighbourRow(list.current, id), []);
  const focusRow = useCallback((id: string) => rowButton(list.current, id)?.focus(), []);
  // The clock reads 0 until the first tick after mounting; the list waits for it so "today" is right.
  const todos = now === 0 ? undefined : fetched.data?.filter((todo) => todo.id !== deletion.pending?.id);
  const today = localDay(now);
  // A row checked or unchecked a moment ago keeps its place for a beat, so the rows under your pointer don't jump.
  const buckets = bucketTodos((todos ?? []).map((todo) => settling.get(todo.id) ?? todo), today);
  const byId = new Map((todos ?? []).map((todo) => [todo.id, todo]));
  const openToday = buckets.today.filter((todo) => byId.get(todo.id)?.done !== true).length;
  const openCount = buckets.today.length + buckets.next.length + buckets.later.length + buckets.someday.length;
  // In the order you checked them off, so the one you just did lands last.
  const doneToday = buckets.doneToday.toSorted((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
  const doneShown = allDone ? doneToday : doneToday.slice(-DONE_SHOWN);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  /** Runs `then` after `ms`, replacing what was waiting under the same `key`. */
  const later = useCallback((key: string, ms: number, then: () => void) => {
    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        then();
      }, ms),
    );
  }, []);
  const change = useCallback(
    (id: string, next: TodoChange) => {
      const before = fetched.data?.find((todo) => todo.id === id);
      if (next.done !== undefined && before !== undefined) {
        // A second toggle while the first settles keeps the place it was first seen in.
        setSettling((placed) => (placed.has(id) ? placed : new Map(placed).set(id, before)));
        later(`settle:${id}`, SETTLE_MS, () => {
          // A row you clicked moves away: the row that takes its place gets the keyboard, not the page.
          const row = rowButton(list.current, id)?.closest("li");
          const next = row?.contains(document.activeElement) === true ? neighbour(id) : undefined;
          setSettling((placed) => {
            const left = new Map(placed);
            left.delete(id);
            return left;
          });
          if (next !== undefined) requestAnimationFrame(() => focusRow(next));
        });
        // Emptied first, so saying the same thing twice is still announced.
        setAnnounced("");
        later("announce", 50, () => setAnnounced(t(next.done ? "todos.announceDone" : "todos.announceNotDone", { text: before.text })));
      }
      void run(update(id, next));
    },
    [update, fetched.data, later, neighbour, focusRow, t, run],
  );
  const rowKeys = useTodoKeys(todos, today, change);
  // z undoes a delete anywhere in the pane, the Undo bar included; typing in a field is left alone.
  function onPaneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (todoKey(event.nativeEvent) !== "undo" || deletion.pending === undefined || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("input, textarea") !== null) return;
    event.preventDefault();
    const id = deletion.pending.id;
    deletion.undo();
    requestAnimationFrame(() => focusRow(id));
  }

  async function addForToday(text: string) {
    const added = await run(add({ text, plannedFor: today, ...(due === "" ? {} : { due }) }));
    if (added) setDue("");
    return added;
  }

  function row(placed: Todo) {
    const todo = byId.get(placed.id) ?? placed;
    return (
      <TodoRow
        key={todo.id}
        todo={todo}
        today={today}
        onChange={(next) => change(todo.id, next)}
        onOpen={(pin) => workbench.open(todoTab(todo), { preview: !pin })}
        onRemove={() => {
          // The row goes away; the keyboard stays in the list on the row after it, or on Undo when none is left.
          const next = neighbour(todo.id);
          deletion.start(todo);
          if (next !== undefined) focusRow(next);
          else focusUndo.current = true;
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onPaneKeyDown}>
      {/* Folded, the header says what is left for today; open, the Today group does. */}
      <PaneHeader title={t("section.todos")} count={folded ? { value: openToday, label: t("todos.leftForToday") } : undefined}>
        <button type="button" aria-label={t("todos.openDaily")} title={t("todos.openDailyTitle", { keys: formatBinding("g d") })} className={ICON_BUTTON} onClick={() => workbench.open({ kind: "daily" })}>
          <CalendarCheck size={13} />
        </button>
        <button
          type="button"
          aria-label={t("todos.newWithNotes")}
          title={t("todos.newWithNotesTitle", { keys: formatBinding("shift+t") })}
          className={ICON_BUTTON}
          onClick={() => workbench.open(newTodoTab())}
        >
          <SquarePen size={13} />
        </button>
      </PaneHeader>
      <AddTodo
        placeholder={t("todos.addForToday")}
        label={t("todos.newForToday")}
        onAdd={addForToday}
        className="mx-2 mb-1 border-zinc-300 text-xs dark:border-zinc-700"
        trailing={(text) => (
          <>
            {due !== "" && (
              <span className="shrink-0 text-[11px] text-zinc-500" title={due}>
                {dayName(due, today)}
              </span>
            )}
            {(text !== "" || due !== "") && <DueButton due={due === "" ? undefined : due} onPick={(picked) => setDue(picked ?? "")} />}
          </>
        )}
      />
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-1 pb-3" onKeyDown={rowKeys}>
        {failure !== undefined && (
          <p role="alert" className="flex items-start gap-1 px-2 py-1 text-[11px] text-red-600 dark:text-red-400">
            <span className="min-w-0 flex-1">{failure}</span>
            <button type="button" aria-label={t("ui.dismiss")} title={t("ui.dismiss")} className={ICON_BUTTON} onClick={() => setFailure(undefined)}>
              <X size={12} />
            </button>
          </p>
        )}
        <p role="status" className="sr-only">
          {announced}
        </p>
        {todos === undefined ? (
          <p className="px-2 py-1 text-xs text-zinc-500">{fetched.error ?? t("todos.reading")}</p>
        ) : (
          <>
            <Group title={t("todos.today")} count={openToday} note={doneToday.length > 0 ? t("todos.doneCount", { count: doneToday.length }) : undefined}>
              {buckets.today.length === 0 && (
                <li className="px-2 py-1 text-xs text-zinc-500">
                  {doneToday.length > 0 ? t("todos.allDoneToday") : openCount === 0 ? t("todos.emptyList") : t("todos.nothingToday")}
                </li>
              )}
              {buckets.today.map(row)}
              {doneToday.length > DONE_SHOWN && (
                <li>
                  <button
                    type="button"
                    aria-expanded={allDone}
                    onClick={() => setAllDone((shown) => !shown)}
                    className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
                  >
                    <ChevronRight size={12} aria-hidden className={`shrink-0 transition-transform ${allDone ? "rotate-90" : ""}`} />
                    {allDone ? t("todos.hideEarlierDone") : t("todos.showEarlierDone", { count: doneToday.length - DONE_SHOWN })}
                  </button>
                </li>
              )}
              {doneShown.map(row)}
            </Group>
            {buckets.next.length > 0 && (
              <Group title={dayName(nextWorkday(today), today)} count={buckets.next.length}>
                {buckets.next.map(row)}
              </Group>
            )}
            {buckets.later.length > 0 && (
              <Group title={t("todos.later")} count={buckets.later.length}>
                {buckets.later.map(row)}
              </Group>
            )}
            {buckets.someday.length > 0 && (
              <Group title={t("todos.someday")} count={buckets.someday.length}>
                {buckets.someday.map(row)}
              </Group>
            )}
            {buckets.doneEarlier.length > 0 && (
              <button
                type="button"
                onClick={() => workbench.open({ kind: "daily" })}
                aria-label={t("todos.doneBeforeTodayAria", { count: buckets.doneEarlier.length })}
                title={t("todos.doneBeforeTodayTitle", { keys: formatBinding("g d") })}
                className="mt-2 flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
              >
                <History size={12} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t("todos.doneBeforeToday")}</span>
                <span className="tabular-nums">{buckets.doneEarlier.length}</span>
                <ArrowUpRight size={12} aria-hidden className="shrink-0" />
              </button>
            )}
          </>
        )}
      </div>
      <UndoDeleteBar deletion={deletion} buttonRef={undoButton} className="mx-2 mb-2" />
    </div>
  );
}

/** The title button of to-do `id` in `list` (the Daily tab has rows of its own). */
function rowButton(list: HTMLElement | null, id: string) {
  return list?.querySelector<HTMLElement>(`[${TODO_ROW_ATTRIBUTE}="${CSS.escape(id)}"]`) ?? undefined;
}

/** The id of the row after `id` in `list`, else the one before it. */
function neighbourRow(list: HTMLElement | null, id: string) {
  const rows = [...(list?.querySelectorAll<HTMLElement>(`[${TODO_ROW_ATTRIBUTE}]`) ?? [])];
  const index = rows.findIndex((row) => row.getAttribute(TODO_ROW_ATTRIBUTE) === id);
  return (rows[index + 1] ?? rows[index - 1])?.getAttribute(TODO_ROW_ATTRIBUTE) ?? undefined;
}
