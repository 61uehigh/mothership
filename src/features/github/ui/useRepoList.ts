"use client";

import type { GhErrorCode } from "@/lib/apiErrorCodes";
import { useJson, type Fetched } from "@/ui/useJson";
import type { RepoList } from "@/features/github/model/GitHub";

/**
 * ### useRepoList
 *
 * The GitHub section's repositories (local checkouts and ones added from
 * your account), from `/api/github/repos`.
 */
export function useRepoList(): Fetched<RepoList, GhErrorCode> {
  return useJson<RepoList, GhErrorCode>("/api/github/repos");
}
