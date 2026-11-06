"use client";

import { useEffect, useState } from "react";

/**
 * ### useNow
 *
 * Current time that re-renders the caller every `intervalMs`. Starts at 0
 * because pages are prerendered, where reading the clock is not allowed;
 * it is set right after the first client render.
 *
 * @returns Epoch milliseconds, or 0 before the first tick.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
