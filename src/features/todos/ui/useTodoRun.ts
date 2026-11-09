"use client";

import { useCallback, useState } from "react";

/** What a call from `useTodos` resolves to. */
type Outcome = { ok: true } | { ok: false; error: string };

/**
 * ### useTodoRun
 *
 * Runs to-do changes and keeps the last one's error to show, cleared by the
 * next change that works.
 *
 * @returns `run` resolves to whether the change worked (e.g. to clear an input), and keeps its identity.
 */
export function useTodoRun(): { failure: string | undefined; setFailure: (failure: string | undefined) => void; run: (request: Promise<Outcome>) => Promise<boolean> } {
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const run = useCallback(async (request: Promise<Outcome>) => {
    const outcome = await request;
    setFailure(outcome.ok ? undefined : outcome.error);
    return outcome.ok;
  }, []);
  return { failure, setFailure, run };
}
