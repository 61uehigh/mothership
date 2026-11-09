"use client";

import { type ApiResult, fetchJson, jsonRequest } from "@/ui/useJson";
import type { NewTodo, Todo, TodoChange } from "@/features/todos/model/Todos";
import type { Tab } from "@/shell/tabs";
import type { Translate } from "@/ui/i18n/translate";

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
  return afterTodoChange(fetchJson<Todo>("/api/todos", jsonRequest("POST", todo)));
}

/**
 * ### updateTodo
 *
 * Changes one to-do and tells open lists to reload.
 */
export function updateTodo(id: string, change: TodoChange): Promise<ApiResult<Todo>> {
  return afterTodoChange(fetchJson<Todo>(`/api/todos/${id}`, jsonRequest("PATCH", change)));
}

/**
 * ### NEW_TODO_TITLE
 *
 * Tab title of a to-do that has no title yet, as stored with the tab. It
 * stays English in the saved tab; {@link todoTabTitle} shows it in the
 * chosen language.
 */
export const NEW_TODO_TITLE = "New to-do";

/**
 * ### todoTabTitle
 *
 * @returns The title a to-do's tab shows: its own, or "New to-do" in the
 *   chosen language while it has none yet.
 */
export function todoTabTitle(tab: Extract<Tab, { kind: "todo" }>, t: Translate): string {
  return tab.isNew === true && tab.title === NEW_TODO_TITLE ? t("todos.newTitle") : tab.title;
}

/**
 * ### newTodoTab
 *
 * A tab to write a new to-do in, title and notes. Its id is picked now, so
 * the tab keeps pointing at the to-do once it is saved.
 */
export function newTodoTab(): Tab {
  return { kind: "todo", todoId: crypto.randomUUID(), title: NEW_TODO_TITLE, isNew: true };
}

/**
 * ### todoTab
 *
 * @returns The tab that shows `todo`.
 */
export function todoTab(todo: Pick<Todo, "id" | "text">): Tab {
  return { kind: "todo", todoId: todo.id, title: todo.text };
}
