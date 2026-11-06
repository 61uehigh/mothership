"use client";

import { useCallback, useState } from "react";

/**
 * ### toggled
 *
 * @returns A copy of `set` with `item` removed if present, otherwise added.
 */
export function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

/**
 * ### useToggleSet
 *
 * A set of items (e.g. folded sections) and a stable function that adds or
 * removes one.
 */
export function useToggleSet<T>(): [ReadonlySet<T>, (item: T) => void] {
  const [set, setSet] = useState<ReadonlySet<T>>(() => new Set<T>());
  const toggle = useCallback((item: T) => setSet((current) => toggled(current, item)), []);
  return [set, toggle];
}
