"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Raw values by key: read from localStorage once, then kept here so a value
// still changes for this session when storage is blocked or full.
const cache = new Map<string, string | undefined>();
const listeners = new Map<string, Set<() => void>>();

function readRaw(key: string): string | undefined {
  if (!cache.has(key)) {
    let raw: string | undefined;
    try {
      raw = localStorage.getItem(key) ?? undefined;
    } catch {
      // Storage blocked: start from the fallback.
    }
    cache.set(key, raw);
  }
  return cache.get(key);
}

function writeRaw(key: string, raw: string): void {
  cache.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    // Storage blocked or full: the value applies now but is not remembered across reloads.
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

function defaultSerialize(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * ### useStoredState
 *
 * Like `useState`, but remembered in localStorage under `key`. Prerendering
 * and hydration see `fallback`, so markup matches the server; the stored
 * value applies right after. Every component using the same key in this tab
 * sees updates.
 *
 * @param fallback - Value when nothing (valid) is stored. Pass a stable value, e.g. a module constant.
 * @param parse - Reads a stored string; `undefined` rejects it in favour of `fallback`. Pass a stable function.
 * @param serialize - Defaults to the string itself, or JSON for other values.
 * @returns The value and a setter that accepts a value or an updater.
 */
export function useStoredState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string = defaultSerialize,
): [T, (next: T | ((current: T) => T)) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => undefined,
  );
  const value = useMemo(() => (raw === undefined ? fallback : (parse(raw) ?? fallback)), [raw, fallback, parse]);

  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      const stored = readRaw(key);
      const current = stored === undefined ? fallback : (parse(stored) ?? fallback);
      // A function argument is an updater, as with `useState`; stored values are never functions.
      const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
      writeRaw(key, serialize(resolved));
    },
    [key, fallback, parse, serialize],
  );

  return [value, set];
}
