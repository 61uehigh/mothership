"use client";

import { useCallback, useEffect } from "react";
import { addTodo, afterTodoChange, TODOS_CHANGED_EVENT } from "@/shell/todos";
import { type ApiResult, fetchJson, fetchText, jsonRequest, useJson } from "@/ui/useJson";
import type { Todo, TodoChange } from "@/features/todos/model/Todos";

/**
 * ### updateTodo
 *
 * Changes one to-do and tells open lists to reload.
 */
export function updateTodo(id: string, change: TodoChange): Promise<ApiResult<Todo>> {
  return afterTodoChange(fetchJson<Todo>(`/api/todos/${id}`, jsonRequest("PATCH", change)));
}

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
  const clearDone = useCallback(() => afterTodoChange(fetchJson<{ deleted: number }>("/api/todos?done=1", { method: "DELETE" })), []);
  return { fetched, add: addTodo, update: updateTodo, remove, clearDone };
}
