"use client";

import { CalendarDays, ChevronRight, NotebookPen, Plus, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { ICON_BUTTON } from "@/ui/IconButton";
import { useNow } from "@/ui/useNow";
import type { Todo } from "@/features/todos/model/Todos";
import { useTodos } from "@/features/todos/ui/useTodos";

const CLOCK_TICK_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;

// `YYYY-MM-DD` in local time; "sv-SE" formats dates that way.
const localDay = (epochMs: number) => new Date(epochMs).toLocaleDateString("sv-SE");

/** How a due date reads next to a to-do, and whether it is late. */
function dueLabel(due: string, now: number): { text: string; tone: "late" | "today" | "later" } {
  const today = localDay(now);
  if (due < today) return { text: `Overdue · ${shortDate(due)}`, tone: "late" };
  if (due === today) return { text: "Today", tone: "today" };
  if (due === localDay(now + DAY_MS)) return { text: "Tomorrow", tone: "later" };
  return { text: shortDate(due), tone: "later" };
}

function shortDate(day: string): string {
  // Noon, so a time zone shift never moves it to another day.
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
}

const TONE = {
  late: "text-red-600 dark:text-red-400",
  today: "text-amber-600 dark:text-amber-400",
  later: "text-zinc-500",
};

const DATE_INPUT = "rounded border border-zinc-300 bg-transparent px-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300 dark:[color-scheme:dark]";

/** A date picker behind an icon button; picking calls `onPick` (`null` when cleared). */
function DueButton({ due, onPick }: { due: string | undefined; onPick: (due: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={due === undefined ? "Set a due date" : "Change the due date"}
        title={due === undefined ? "Set a due date" : "Change the due date"}
        className={ICON_BUTTON}
        onClick={() => input.current?.showPicker()}
      >
        <CalendarDays size={12} />
      </button>
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={due ?? ""}
        onChange={(event) => onPick(event.target.value === "" ? null : event.target.value)}
        className="pointer-events-none absolute right-0 top-full h-0 w-0 opacity-0"
      />
    </span>
  );
}

function TodoRow({
  todo,
  now,
  onToggle,
  onRename,
  onDue,
  onRemove,
  onOpenSource,
}: {
  todo: Todo;
  now: number;
  onToggle: () => void;
  onRename: (text: string) => void;
  onDue: (due: string | null) => void;
  onRemove: () => void;
  onOpenSource: () => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const due = todo.due === undefined || todo.done ? undefined : dueLabel(todo.due, now);
  function finish() {
    const text = draft?.trim();
    setDraft(undefined);
    if (text !== undefined && text !== "" && text !== todo.text) onRename(text);
  }
  return (
    <li className="group/todo flex items-start gap-2 rounded-md px-2 py-1 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={onToggle}
        aria-label={todo.done ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
        className="mt-[3px] size-3.5 shrink-0 accent-teal-600"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        {draft === undefined ? (
          <button
            type="button"
            title="Click to edit"
            onClick={() => setDraft(todo.text)}
            className={`whitespace-pre-wrap break-words text-left text-[13px] ${todo.done ? "text-zinc-500 line-through" : ""}`}
          >
            {todo.text}
          </button>
        ) : (
          <input
            autoFocus
            value={draft}
            aria-label="To-do text"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) finish();
              if (event.key === "Escape") setDraft(undefined);
            }}
            className="w-full rounded bg-white px-1 text-[13px] outline-none ring-1 ring-teal-500 dark:bg-zinc-900"
          />
        )}
        {(due !== undefined || todo.source !== undefined) && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
            {due !== undefined && <span className={`shrink-0 ${TONE[due.tone]}`}>{due.text}</span>}
            {todo.source !== undefined && (
              <button type="button" onClick={onOpenSource} title={`Open ${todo.source.title}`} className="flex min-w-0 items-center gap-0.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                <NotebookPen size={10} aria-hidden className="shrink-0" />
                <span className="truncate">{todo.source.title}</span>
              </button>
            )}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center opacity-0 focus-within:opacity-100 group-hover/todo:opacity-100">
        {!todo.done && <DueButton due={todo.due} onPick={onDue} />}
        <button type="button" aria-label={`Delete "${todo.text}"`} title="Delete" className={ICON_BUTTON} onClick={onRemove}>
          <X size={12} />
        </button>
      </span>
    </li>
  );
}

/**
 * ### TodoPane
 *
 * Your to-do list: add one with Enter (and a due date if you like), check it
 * off, click its text to edit. Open to-dos are ordered by due date; done ones
 * fold away under "Done".
 */
export function TodoPane() {
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const { fetched, add, update, remove, clearDone } = useTodos();
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const todos = fetched.data;
  const open = todos?.filter((t) => !t.done) ?? [];
  const done = todos?.filter((t) => t.done) ?? [];

  async function run(change: Promise<{ ok: true } | { ok: false; error: string }>) {
    const outcome = await change;
    setFailure(outcome.ok ? undefined : outcome.error);
    return outcome.ok;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() === "") return;
    if (await run(add({ text: text.trim(), ...(due === "" ? {} : { due }) }))) {
      setText("");
      setDue("");
    }
  }

  function row(todo: Todo) {
    return (
      <TodoRow
        key={todo.id}
        todo={todo}
        now={now}
        onToggle={() => void run(update(todo.id, { done: !todo.done }))}
        onRename={(next) => void run(update(todo.id, { text: next }))}
        onDue={(next) => void run(update(todo.id, { due: next }))}
        onRemove={() => void run(remove(todo.id))}
        onOpenSource={() => {
          if (todo.source !== undefined) workbench.open({ kind: "meeting", itemId: todo.source.itemId, title: todo.source.title });
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Todo">{open.length > 0 && <span className="tabular-nums">{open.length}</span>}</PaneHeader>
      <form onSubmit={(event) => void submit(event)} className="mx-2 mb-1 flex items-center gap-1 rounded-md border border-zinc-300 px-1.5 focus-within:border-teal-500 dark:border-zinc-700">
        <Plus size={13} aria-hidden className="shrink-0 text-zinc-500" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter while composing Korean picks the character; it must not add the to-do yet.
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
          placeholder="Add a to-do"
          aria-label="New to-do"
          maxLength={500}
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] outline-none placeholder:text-zinc-500"
        />
        {(text !== "" || due !== "") && <input type="date" aria-label="Due date" value={due} onChange={(event) => setDue(event.target.value)} className={DATE_INPUT} />}
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {failure !== undefined && <p className="px-2 py-1 text-[11px] text-red-600 dark:text-red-400">{failure}</p>}
        {todos === undefined ? (
          <p className="px-2 py-1 text-xs text-zinc-500">{fetched.error ?? "Reading your to-dos…"}</p>
        ) : (
          <>
            {open.length === 0 && <p className="px-2 py-1 text-[11px] text-zinc-500">{done.length === 0 ? "Nothing to do yet." : "All done."}</p>}
            <ul>{open.map(row)}</ul>
            {done.length > 0 && (
              <section className="mt-1">
                <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-500">
                  <button
                    type="button"
                    aria-expanded={showDone}
                    onClick={() => setShowDone((shown) => !shown)}
                    className="flex flex-1 items-center gap-1 text-left hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <ChevronRight size={12} aria-hidden className={`transition-transform ${showDone ? "rotate-90" : ""}`} />
                    Done <span className="tabular-nums">{done.length}</span>
                  </button>
                  {showDone && (
                    <button type="button" onClick={() => void run(clearDone())} className="hover:text-zinc-900 dark:hover:text-zinc-100">
                      Clear
                    </button>
                  )}
                </div>
                {showDone && <ul>{done.map(row)}</ul>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
