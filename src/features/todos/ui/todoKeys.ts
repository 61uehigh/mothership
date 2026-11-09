import { nextWorkday } from "@/features/todos/model/Daily";
import type { Todo, TodoChange } from "@/features/todos/model/Todos";
import { eventToStep } from "@/shell/commands/keys";

/**
 * ### TodoKey
 *
 * What a single-key shortcut in the to-do list or the Daily tab asks for.
 */
export type TodoKey = "next" | "previous" | "done" | "today" | "nextWorkday" | "someday" | "blocked" | "previousDay" | "nextDay" | "copyStandup" | "undo";

const STEP_TO_KEY = new Map<string, TodoKey>([
  ["j", "next"],
  ["down", "next"],
  ["shift+down", "next"],
  ["k", "previous"],
  ["up", "previous"],
  ["shift+up", "previous"],
  ["x", "done"],
  ["t", "today"],
  ["m", "nextWorkday"],
  ["s", "someday"],
  ["b", "blocked"],
  ["[", "previousDay"],
  ["]", "nextDay"],
  ["c", "copyStandup"],
  ["z", "undo"],
]);

/**
 * ### todoKey
 *
 * Goes through {@link eventToStep}, which reads the physical key, so the
 * shortcuts still work with the Korean input source on (`x` types `ㅌ`).
 * A shifted letter is not a shortcut; a shifted arrow still moves.
 *
 * @returns The shortcut the key press asks for, or `undefined` for any other key.
 */
export function todoKey(event: KeyboardEvent): TodoKey | undefined {
  const step = eventToStep(event);
  return step === undefined ? undefined : STEP_TO_KEY.get(step);
}

/**
 * ### todoKeyChange
 *
 * @returns The change a shortcut makes to the focused to-do, or `undefined`
 *   for a shortcut that changes no to-do (moving, changing the day, …).
 */
export function todoKeyChange(key: TodoKey, todo: Todo, today: string): TodoChange | undefined {
  switch (key) {
    case "done":
      return { done: !todo.done };
    case "today":
      return { plannedFor: today };
    case "nextWorkday":
      return { plannedFor: nextWorkday(today) };
    case "someday":
      return { plannedFor: null };
    case "blocked":
      return { blocked: !todo.blocked };
    default:
      return undefined;
  }
}
