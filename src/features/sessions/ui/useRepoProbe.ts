"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/ui/useJson";
import type { FolderProblem, RepoProbe } from "@/features/sessions/ui/repoProbe";

const REPO_CHECK_DEBOUNCE_MS = 400;

/**
 * ### useRepoProbe
 *
 * Asks the server whether `dir` is in a git repository, 400 ms after it last
 * changed. A newer value aborts the check in flight; the last answer stays
 * shown until the next one arrives.
 *
 * @returns `undefined` until the first check answers.
 */
export function useRepoProbe(dir: string): RepoProbe | undefined {
  const [probe, setProbe] = useState<RepoProbe | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchJson<{ root: string | null; problem?: FolderProblem }>(`/api/repo?dir=${encodeURIComponent(dir.trim())}`, { signal: controller.signal }).then((result) => {
        // A newer keystroke aborted this check; its replacement will report.
        if (controller.signal.aborted) return;
        setProbe(result.ok ? { root: result.data.root ?? undefined, problem: result.data.problem } : { root: undefined, error: result.error });
      });
    }, REPO_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dir]);

  return probe;
}
