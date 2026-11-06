/** How many recent errors are kept. */
const KEEP = 20;

export type PageError = { at: number; message: string };

let errors: Array<PageError> = [];
const listeners = new Set<() => void>();

/**
 * ### recordPageError
 *
 * Keeps an error this page ran into (an uncaught exception, a failed API
 * call) for the debug panel and feedback.
 */
export function recordPageError(message: string): void {
  errors = [...errors.slice(-(KEEP - 1)), { at: Date.now(), message: message.slice(0, 1000) }];
  for (const listener of listeners) listener();
}

/**
 * ### pageErrors
 *
 * @returns The recent errors, oldest first.
 */
export function pageErrors(): Array<PageError> {
  return errors;
}

/**
 * ### subscribePageErrors
 *
 * For `useSyncExternalStore`.
 *
 * @returns Unsubscribes.
 */
export function subscribePageErrors(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * ### watchPageErrors
 *
 * Records uncaught exceptions and rejected promises on this page.
 *
 * @returns Stops watching.
 */
export function watchPageErrors(): () => void {
  const onError = (event: ErrorEvent) => recordPageError(event.error instanceof Error ? (event.error.stack ?? event.error.message) : event.message);
  const onRejection = (event: PromiseRejectionEvent) =>
    recordPageError(`Unhandled rejection: ${event.reason instanceof Error ? (event.reason.stack ?? event.reason.message) : String(event.reason)}`);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
