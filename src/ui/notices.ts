import type { ApiResult } from "@/ui/useJson";

/** At most this many notices show at once; older ones make way. */
const KEEP = 4;
/** How long a notice stays before it goes on its own. */
const NOTICE_MS = 8000;

/**
 * ### Notice
 *
 * A failure the page tells you about in the corner, for actions that have no
 * place of their own to show it (a header button, a keyboard command).
 */
export type Notice = {
  id: number;
  message: string;
  /** How many times the same message came in while it was showing. */
  count: number;
};

/**
 * ### addNotice
 *
 * The list after `message` arrives: the same message showing already is
 * counted again and moved to the end instead of stacking, and only the
 * newest `keep` stay.
 */
export function addNotice(list: ReadonlyArray<Notice>, message: string, id: number, keep = KEEP): Array<Notice> {
  const same = list.find((n) => n.message === message);
  const next = [...list.filter((n) => n !== same), { id, message, count: (same?.count ?? 0) + 1 }];
  return next.slice(-keep);
}

let notices: Array<Notice> = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function stopTimer(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

function publish(next: Array<Notice>): void {
  notices = next;
  for (const listener of listeners) listener();
}

/**
 * ### dismissNotice
 *
 * Removes one notice now.
 */
export function dismissNotice(id: number): void {
  stopTimer(id);
  if (notices.some((n) => n.id === id)) publish(notices.filter((n) => n.id !== id));
}

/**
 * ### showError
 *
 * Shows a failure in the corner notice stack; it goes after 8 seconds or
 * when dismissed.
 */
export function showError(message: string): void {
  const id = nextId++;
  const next = addNotice(notices, message, id);
  for (const old of notices) if (!next.some((n) => n.id === old.id)) stopTimer(old.id);
  timers.set(
    id,
    setTimeout(() => dismissNotice(id), NOTICE_MS),
  );
  publish(next);
}

/**
 * ### reportFailure
 *
 * Shows `result`'s error as a notice, prefixed with what was being done,
 * when the call failed.
 *
 * @param action - What failed, e.g. `Couldn't stop the turn`.
 * @returns Whether the call succeeded.
 */
export function reportFailure<T, C extends string>(action: string, result: ApiResult<T, C>): result is { ok: true; data: T } {
  if (!result.ok) showError(`${action}: ${result.error}`);
  return result.ok;
}

/**
 * ### currentNotices
 *
 * @returns The notices showing, oldest first.
 */
export function currentNotices(): Array<Notice> {
  return notices;
}

/**
 * ### subscribeNotices
 *
 * For `useSyncExternalStore`.
 *
 * @returns Unsubscribes.
 */
export function subscribeNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
