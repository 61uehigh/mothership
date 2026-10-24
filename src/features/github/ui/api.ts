"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson, useJson, type ApiResult, type Fetched } from "@/ui/useJson";
import type { GhErrorCode, PullRequest, RepoList } from "@/features/github/model/GitHub";

/**
 * ### useLocalRepos
 *
 * The GitHub section's repositories (local checkouts and ones added from
 * your account), from `/api/github/repos`.
 */
export function useLocalRepos(): Fetched<RepoList, GhErrorCode> {
  return useJson<RepoList, GhErrorCode>("/api/github/repos");
}

const prRequests = new Map<string, Promise<ApiResult<PullRequest, GhErrorCode>>>();
const prReloadListeners = new Set<(key: string) => void>();

/**
 * ### usePullRequest
 *
 * Loads `/api/github/pr`. The center tab and the details column share one
 * request per pull request, and reloading in one reloads both.
 *
 * @returns The result (`undefined` while loading), whether a load is in
 *   flight, and a function that refetches it.
 */
export function usePullRequest(
  repo: string,
  number: number,
): { result: ApiResult<PullRequest, GhErrorCode> | undefined; loading: boolean; reload: () => void } {
  const key = `${repo}#${number}`;
  const [state, setState] = useState<{ key: string; version: number; result: ApiResult<PullRequest, GhErrorCode> } | undefined>(undefined);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let request = prRequests.get(key);
    if (request === undefined) {
      request = fetchJson<PullRequest, GhErrorCode>(`/api/github/pr?repo=${encodeURIComponent(repo)}&number=${number}`);
      prRequests.set(key, request);
      // Shared only while in flight and briefly after, so reopening a tab shows fresh data.
      const mine = request;
      // Only this request's entry: a reload may have stored a newer one under the same key meanwhile.
      void request.finally(() => setTimeout(() => prRequests.get(key) === mine && prRequests.delete(key), 2_000));
    }
    void request.then((result) => {
      if (!cancelled) setState({ key, version, result });
    });
    return () => {
      cancelled = true;
    };
  }, [key, repo, number, version]);

  // Every view of this pull request refetches together, sharing the new request.
  useEffect(() => {
    const listener = (reloaded: string) => {
      if (reloaded === key) setVersion((v) => v + 1);
    };
    prReloadListeners.add(listener);
    return () => {
      prReloadListeners.delete(listener);
    };
  }, [key]);

  const reload = useCallback(() => {
    prRequests.delete(key);
    for (const listener of prReloadListeners) listener(key);
  }, [key]);

  const current = state?.key === key ? state : undefined;
  return { result: current?.result, loading: current === undefined || current.version !== version, reload };
}
