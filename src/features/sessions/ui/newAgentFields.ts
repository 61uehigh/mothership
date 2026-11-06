import { SESSION_NAME_MAX } from "@/features/sessions/model/Agent";
import { COMPARE_NAME_MAX } from "@/features/sessions/model/Compare";

/**
 * ### FIELD_CLASS
 *
 * The class every text field, select, and textarea in the New session dialog shares.
 */
export const FIELD_CLASS = "w-full rounded-md border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-zinc-700";

/**
 * ### DEFAULT_ROLE
 *
 * The role a new session gets unless you pick another under More options.
 */
export const DEFAULT_ROLE = "lead";

/**
 * ### leadsSession
 *
 * Whether a session started with `role` is a lead, so the lead picker and
 * your default lead apply: the lead role, or no role at all (a session you
 * start always gets the lead's briefing).
 */
export function leadsSession(role: string): boolean {
  return role === DEFAULT_ROLE || role === "";
}

/**
 * ### nameFromTask
 *
 * A session name from the task's first line, e.g. "Fix the login redirect bug".
 * Lines over 48 characters are cut and end in "…".
 */
export function nameFromTask(task: string): string {
  const firstLine = task.trim().split("\n")[0] ?? "";
  return firstLine.length <= 48 ? firstLine : `${firstLine.slice(0, 47).trimEnd()}…`;
}

/**
 * ### sessionNameMax
 *
 * The longest name the route a New session start goes to takes: a compare
 * run's names are shorter, since each attempt's session adds to them.
 */
export function sessionNameMax(comparing: boolean): number {
  return comparing ? COMPARE_NAME_MAX : SESSION_NAME_MAX;
}

/**
 * ### sessionNameFor
 *
 * The name the New session dialog sends: what you typed, or one taken from
 * the task, cut to the limit of the route it goes to. A name typed before
 * ticking Compare run can be longer than a compare run takes, and the field's
 * `maxLength` only stops new typing.
 */
export function sessionNameFor(name: string, task: string, comparing: boolean): string {
  const chosen = name.trim() !== "" ? name.trim() : nameFromTask(task);
  return chosen.slice(0, sessionNameMax(comparing)).trim();
}
