"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void): () => void {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/**
 * ### usePageVisible
 *
 * @returns `false` while this browser tab is hidden (another tab in front,
 *   window minimized), e.g. to pause polling. `true` during prerender.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !document.hidden,
    () => true,
  );
}
