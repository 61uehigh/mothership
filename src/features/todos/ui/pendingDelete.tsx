"use client";

import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import type { Todo } from "@/features/todos/model/Todos";
import { useT } from "@/ui/i18n/useT";

/** How long Undo is offered after a delete. */
const UNDO_MS = 5_000;

/**
 * ### PendingDelete
 *
 * A to-do waiting to be deleted, and the two ways out.
 */
export type PendingDelete = {
  /** The to-do waiting; lists leave it out while it waits. */
  pending: Todo | undefined;
  start: (todo: Todo) => void;
  undo: () => void;
};

/**
 * ### usePendingDelete
 *
 * Deletes a to-do only after a few seconds in which you can take it back,
 * the same in the to-do list and the Daily tab; a second delete, or leaving
 * the screen, deletes the one waiting at once.
 *
 * @param onFailure - Gets the delete's error, or `undefined` once one works.
 */
export function usePendingDelete(remove: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>, onFailure: (message: string | undefined) => void): PendingDelete {
  const [pending, setPending] = useState<Todo | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waiting = useRef<Todo | undefined>(undefined);
  const commit = useCallback(() => {
    clearTimeout(timer.current);
    const todo = waiting.current;
    waiting.current = undefined;
    setPending(undefined);
    if (todo !== undefined) void remove(todo.id).then((outcome) => onFailure(outcome.ok ? undefined : outcome.error));
  }, [remove, onFailure]);
  useEffect(() => commit, [commit]);
  return {
    pending,
    start(todo: Todo) {
      commit();
      waiting.current = todo;
      setPending(todo);
      timer.current = setTimeout(commit, UNDO_MS);
    },
    undo() {
      clearTimeout(timer.current);
      waiting.current = undefined;
      setPending(undefined);
    },
  };
}

/**
 * ### UndoDeleteBar
 *
 * The bar that says a to-do was deleted, with Undo (also the `z` key, which
 * the screen handles).
 */
export function UndoDeleteBar({ deletion, buttonRef, className = "" }: { deletion: PendingDelete; buttonRef?: Ref<HTMLButtonElement>; className?: string }) {
  const t = useT();
  if (deletion.pending === undefined) return null;
  return (
    <div role="status" className={`flex h-8 shrink-0 items-center gap-2 rounded-md bg-zinc-800 px-2.5 text-xs text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900 ${className}`}>
      <span className="min-w-0 flex-1 truncate">{t("todos.deleted", { text: deletion.pending.text })}</span>
      <kbd className="shrink-0 text-[10px] opacity-60">z</kbd>
      <button type="button" ref={buttonRef} aria-keyshortcuts="z" className="shrink-0 font-medium text-teal-300 hover:underline dark:text-teal-700" onClick={deletion.undo}>
        {t("todos.undo")}
      </button>
    </div>
  );
}
