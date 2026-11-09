"use client";

import { useCallback, type KeyboardEvent } from "react";
import type { Todo, TodoChange } from "@/features/todos/model/Todos";
import { todoKey, todoKeyChange } from "@/features/todos/ui/todoKeys";
import { TODO_ROW_ATTRIBUTE } from "@/features/todos/ui/todoRow";

/**
 * ### useTodoKeys
 *
 * Single-key shortcuts for a list of to-do rows, while one has focus:
 * `j`/`k` (or the arrows) move between rows, `x` checks it off (and moves to the next open one), `t` plans it
 * for today, `m` for the next workday, `s` for someday, and `b` marks it
 * blocked. Enter opens it (the row is a button). Keys typed into a field are left alone.
 *
 * @returns A `keydown` handler for the element around the rows.
 */
export function useTodoKeys(todos: Array<Todo> | undefined, today: string, change: (id: string, change: TodoChange) => void) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']") !== null) return;
      const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(`[${TODO_ROW_ATTRIBUTE}]`)];
      const index = rows.findIndex((row) => row === document.activeElement);
      const move = (by: number) => {
        event.preventDefault();
        rows[index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + by))]?.focus();
      };
      const key = todoKey(event.nativeEvent);
      if (key === "next") return move(1);
      if (key === "previous") return move(-1);
      const id = index === -1 ? undefined : rows[index]!.getAttribute(TODO_ROW_ATTRIBUTE);
      const todo = todos?.find((t) => t.id === id);
      if (todo === undefined || key === undefined) return;
      const next = todoKeyChange(key, todo, today);
      if (next === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      change(todo.id, next);
      // Checking one off moves on to the next open to-do, as a list you work through does; never onto a done one, which x would uncheck.
      if (key === "done" && !todo.done) {
        const open = (row: HTMLElement) => todos?.find((t) => t.id === row.getAttribute(TODO_ROW_ATTRIBUTE))?.done === false;
        (rows.slice(index + 1).find(open) ?? rows.slice(0, index).findLast(open))?.focus();
      }
    },
    [todos, today, change],
  );
}
