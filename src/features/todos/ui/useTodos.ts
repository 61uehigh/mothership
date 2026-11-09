"use client";

import { useCallback, useEffect } from "react";
import { addTodo, afterTodoChange, TODOS_CHANGED_EVENT, updateTodo } from "@/shell/todos";
import { fetchText, useJson } from "@/ui/useJson";
import type { Todo } from "@/features/todos/model/Todos";

/**
 * ### useTodos
 *
 * The to-do list, kept current across every component that shows it.
 *
 * @returns The fetched list and the changes it offers; each resolves to the API result.
 */
export function useTodos() {
  const fetched = useJson<Array<Todo>>("/api/todos", { keepPrevious: true });
  const { reload } = fetched;
  useEffect(() => {
    window.addEventListener(TODOS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TODOS_CHANGED_EVENT, reload);
  }, [reload]);
  // 204 with no body, so read as text.
  const remove = useCallback((id: string) => afterTodoChange(fetchText(`/api/todos/${id}`, { method: "DELETE" })), []);
  return { fetched, add: addTodo, update: updateTodo, remove };
}
