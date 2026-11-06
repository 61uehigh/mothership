"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ### ConnectionTestState
 *
 * What {@link useConnectionTest} gives a card.
 */
export type ConnectionTestState<T> = {
  /** `"running"` while a test is under way, else the last result. */
  test: T | "running" | undefined;
  /** The last finished result, kept on screen while a new test runs. */
  settled: T | undefined;
  /** Replaces the result (e.g. a test run elsewhere), or clears it with `undefined`; a test still running is dropped. */
  setTest: (test: T | undefined) => void;
  /** Runs a test; keeps its identity across renders and always uses the latest `request`. */
  run: () => Promise<void>;
};

/**
 * ### useConnectionTest
 *
 * The Test button's state for one connection card. A second press while a
 * test runs is ignored, so a double click or a focus re-check never sends
 * two tests. `setTest` drops a test still running, so after a mode change
 * the old mode's answer is neither shown nor passed to `onDone`, and the
 * new mode can be tested at once.
 *
 * @param request - Runs the test; it must not reject (use `fetchJson`).
 * @param onDone - Called with each finished result, e.g. to remember it.
 */
export function useConnectionTest<T>(request: () => Promise<T>, onDone?: (result: T) => void): ConnectionTestState<T> {
  const [state, setState] = useState<{ running: boolean; result: T | undefined }>({ running: false, result: undefined });
  const running = useRef(false);
  const latest = useRef({ request, onDone });
  useEffect(() => {
    latest.current = { request, onDone };
  });
  // Bumped by `setTest`: a test still running from before (e.g. of a mode since switched away from) is dropped when it answers.
  const generation = useRef(0);
  const setTest = useCallback((result: T | undefined) => {
    generation.current += 1;
    running.current = false;
    setState({ running: false, result });
  }, []);
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    const started = generation.current;
    setState((current) => ({ ...current, running: true }));
    const result = await latest.current.request();
    if (generation.current !== started) return;
    running.current = false;
    setState({ running: false, result });
    latest.current.onDone?.(result);
  }, []);
  return { test: state.running ? "running" : state.result, settled: state.result, setTest, run };
}

/**
 * ### useRetestOnFocus
 *
 * Runs `run` each time the window gets focus while `active`: after you go
 * turn something on in another tab (an API in Google Cloud, Slack's MCP
 * access), coming back to the app checks again.
 */
export function useRetestOnFocus(active: boolean, run: () => void): void {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!active) return;
    const onFocus = () => latest.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active]);
}
