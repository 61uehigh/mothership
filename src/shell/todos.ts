"use client";

import { fetchJson, type ApiResult } from "@/ui/useJson";
import type { NewTodo, Todo } from "@/features/todos/model/Todos";

/**
 * ### TODOS_CHANGED_EVENT
 *
 * Window event sent after any change to the to-do list, so every list on the page reloads.
 */
export const TODOS_CHANGED_EVENT = "mothership:todos-changed";

/**
 * ### afterTodoChange
 *
 * Waits for a to-do request, then tells open lists to reload.
 */
export async function afterTodoChange<T>(request: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const outcome = await request;
  window.dispatchEvent(new Event(TODOS_CHANGED_EVENT));
  return outcome;
}

/**
 * ### addTodo
 *
 * Adds a to-do from anywhere on the page (a meeting's follow-ups, say).
 */
export function addTodo(todo: NewTodo): Promise<ApiResult<Todo>> {
  return afterTodoChange(fetchJson<Todo>("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(todo) }));
}
