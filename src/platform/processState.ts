const store = globalThis as typeof globalThis & { __mothershipProcessState?: Map<string, unknown> };

/**
 * ### processState
 *
 * One value per server process under `key`, made on first use. Next can load
 * a separate copy of a module for each route, and a dev reload loads another;
 * module-level state would then be one per copy, so caches, locks, and
 * counters that must be shared live here instead.
 *
 * @param key - Unique across the app, e.g. `"github.overview"`.
 */
export function processState<T>(key: string, make: () => T): T {
  const values = (store.__mothershipProcessState ??= new Map());
  if (!values.has(key)) values.set(key, make());
  return values.get(key) as T;
}
