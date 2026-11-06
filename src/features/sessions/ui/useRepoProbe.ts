"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/ui/useJson";

const REPO_CHECK_DEBOUNCE_MS = 400;

/**
 * ### RepoProbe
 *
 * What checking a folder found: `root` is the git repository's root, or
 * `undefined` when the folder is not in a git repository. `error` says the
 * check itself failed, so whether it is a repository is unknown.
 */
export type RepoProbe = { root: string | undefined; error?: string };

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
      void fetchJson<{ root: string | null }>(`/api/repo?dir=${encodeURIComponent(dir.trim())}`, { signal: controller.signal }).then((result) => {
        // A newer keystroke aborted this check; its replacement will report.
        if (controller.signal.aborted) return;
        setProbe(result.ok ? { root: result.data.root ?? undefined } : { root: undefined, error: result.error });
      });
    }, REPO_CHECK_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dir]);

  return probe;
}

/**
 * ### isNotARepo
 *
 * @returns Whether the last check found that the folder is not in a git repository;
 *   `false` while no check has answered yet or the check failed, so nothing is
 *   disabled on a guess.
 */
export function isNotARepo(probe: RepoProbe | undefined): boolean {
  return probe !== undefined && probe.error === undefined && probe.root === undefined;
}
