import type { ApiErrorCode } from "@/lib/apiErrorCodes";

/**
 * ### FolderProblem
 *
 * Why a typed folder can't be worked in, as `/api/repo` reports it.
 */
export type FolderProblem = Extract<ApiErrorCode, "folder-not-absolute" | "folder-missing">;

/**
 * ### RepoProbe
 *
 * What checking a folder found: `root` is the git repository's root, or
 * `undefined` when the folder is not in a git repository. `problem` says it is
 * no folder to work in (relative, or not there). `error` says the check itself
 * failed, so whether it is a repository is unknown.
 */
export type RepoProbe = { root: string | undefined; problem?: FolderProblem; error?: string };

/**
 * ### isNotARepo
 *
 * @returns Whether the last check found that the folder is not in a git repository;
 *   `false` while no check has answered yet, the check failed, or the folder
 *   is not there (creating says why), so nothing is disabled on a guess.
 */
export function isNotARepo(probe: RepoProbe | undefined): boolean {
  return probe !== undefined && probe.error === undefined && probe.problem === undefined && probe.root === undefined;
}
