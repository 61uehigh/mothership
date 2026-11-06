import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { HttpError, type HttpErrorParams } from "@/platform/http/HttpError";
import type { ErrorCode } from "@/lib/apiErrorCodes";
import { errorMessage } from "@/lib/errors";

const run = promisify(execFile);
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
/** A folder on a stalled network drive must not hang a request forever. */
const GIT_TIMEOUT_MS = 2 * 60_000;

/**
 * ### SAFE_GIT_CONFIG
 *
 * `-c` settings that keep a repository's own config and `.git` folder from
 * running programs: no hooks, no fsmonitor program, and no `ext::` transport
 * (which runs a command as the "remote"). An agent session may have written
 * to a repository mothership later runs git in, so {@link runGit} always
 * passes them, and the sessions' git gate adds them to every command it lets
 * through. The repository's own hooks therefore do not run for mothership's
 * merges and commits either.
 */
export const SAFE_GIT_CONFIG: ReadonlyArray<string> = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never"];

/**
 * ### GitError
 *
 * A git command failed or git refused (not a repository, wrong branch,
 * uncommitted changes). Routes answer it with 409. A failure of git itself
 * carries git's own stderr, which is usually the most useful thing to show
 * the user; a refusal of mothership's own carries a `code` (and its facts as
 * `params`) for the browser to word.
 */
export class GitError extends HttpError {
  /**
   * @param options - `code` and `params`: mothership's own reason for refusing, see {@link HttpError}.
   */
  constructor(message: string, options?: ErrorOptions & { code?: ErrorCode; params?: HttpErrorParams }) {
    super(message, 409, options?.code, options);
    this.name = "GitError";
  }
}

/**
 * ### runGit
 *
 * Runs git in `cwd` with arguments passed directly (no shell), with
 * {@link SAFE_GIT_CONFIG} applied.
 *
 * @param options - `maxBytes` raises the 4 MB output cap, e.g. for listing big repositories.
 * @returns The command's stdout.
 * @throws {@link GitError} With git's own stderr when the command fails.
 */
export async function runGit(cwd: string, args: Array<string>, options: { maxBytes?: number } = {}): Promise<string> {
  try {
    const { stdout } = await run("git", ["-c", "core.quotepath=false", ...SAFE_GIT_CONFIG, ...args], { cwd, maxBuffer: options.maxBytes ?? MAX_OUTPUT_BYTES, timeout: GIT_TIMEOUT_MS });
    return stdout;
  } catch (error) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr).trim() : "";
    throw new GitError(`git ${args[0]} failed: ${stderr || (errorMessage(error))}`, {
      cause: error,
    });
  }
}

/**
 * ### repoRoot
 *
 * @returns The top-level directory of the git repository containing `dir`, or
 *   `undefined` when `dir` is not inside one.
 */
export async function repoRoot(dir: string): Promise<string | undefined> {
  try {
    return (await runGit(dir, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    // Not a repository (or not a directory); callers treat both the same.
    return undefined;
  }
}

/**
 * ### gitDirs
 *
 * @returns The absolute git directories of `dir`: its own, and the repository's
 *   common one when they differ (in a linked worktree); empty when `dir` is not
 *   inside a repository.
 */
export async function gitDirs(dir: string): Promise<Array<string>> {
  try {
    const [own = "", common = ""] = (await runGit(dir, ["rev-parse", "--absolute-git-dir", "--git-common-dir"])).trim().split("\n");
    const commonDir = path.resolve(/*turbopackIgnore: true*/ dir, common);
    return own === commonDir ? [own] : [own, commonDir];
  } catch {
    // Not a repository (or not a directory); the caller has no git directory to open.
    return [];
  }
}
