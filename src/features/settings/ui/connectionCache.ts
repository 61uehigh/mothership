"use client";

import { useEffect, useState } from "react";
import type { ConnectionMode, ConnectionTest } from "@/features/settings/model/Settings";

const key = (id: string, mode: ConnectionMode) => `mothership.connection.${id}.${mode}`;

/**
 * ### readCachedTest
 *
 * The last test result this browser saw for a tool in a mode, so a card can
 * show it at once while it checks again. Results carry no secrets: whether it
 * worked, how many items, whose account, or the error.
 *
 * @returns `undefined` when there is none or storage is unavailable.
 */
export function readCachedTest(id: string, mode: ConnectionMode): ConnectionTest | undefined {
  try {
    const raw = localStorage.getItem(key(id, mode));
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && typeof (parsed as { ok?: unknown }).ok === "boolean" ? (parsed as ConnectionTest) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ### writeCachedTest
 *
 * Remembers a finished test for {@link readCachedTest}; `undefined` forgets it
 * (after a disconnect).
 */
export function writeCachedTest(id: string, mode: ConnectionMode, test: ConnectionTest | undefined): void {
  try {
    if (test === undefined) localStorage.removeItem(key(id, mode));
    else localStorage.setItem(key(id, mode), JSON.stringify(test));
  } catch {
    // Without storage the card just checks before it can say anything.
  }
}

/**
 * ### useRemembered
 *
 * A card's latest status, or until it arrives, the one this browser saw
 * last time, so the card doesn't open on "Checking…". Storage failures
 * just mean no stand-in.
 *
 * @param name - Storage name under `mothership.connection.`.
 * @param toStore - What of the value to keep, e.g. without chat contents.
 */
export function useRemembered<T>(name: string, value: T | undefined, toStore: (value: T) => T = (v) => v): T | undefined {
  const storageKey = `mothership.connection.${name}`;
  const [stored] = useState<T | undefined>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    if (value === undefined) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(toStore(value)));
    } catch {
      // Nothing to remember it in.
    }
  }, [storageKey, value, toStore]);
  return value ?? stored;
}
