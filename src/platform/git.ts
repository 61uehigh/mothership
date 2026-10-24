import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HttpError } from "@/platform/http/HttpError";

const run = promisify(execFile);
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
/** A folder on a stalled network drive must not hang a request forever. */
const GIT_TIMEOUT_MS = 2 * 60_000;

/**
 * ### GitError
 *
 * A git command failed or git refused (not a repository, wrong branch,
 * uncommitted changes). The message carries git's own stderr, which is
 * usually the most useful thing to show the user. Routes answer it with 409.
 */
export class GitError extends HttpError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 409, undefined, options);
    this.name = "GitError";
  }
}

/**
 * ### runGit
 *
 * Runs git in `cwd` with arguments passed directly (no shell).
 *
 * @param options - `maxBytes` raises the 4 MB output cap, e.g. for listing big repositories.
 * @returns The command's stdout.
 * @throws {@link GitError} With git's own stderr when the command fails.
 */
export async function runGit(cwd: string, args: Array<string>, options: { maxBytes?: number } = {}): Promise<string> {
  try {
    const { stdout } = await run("git", ["-c", "core.quotepath=false", ...args], { cwd, maxBuffer: options.maxBytes ?? MAX_OUTPUT_BYTES, timeout: GIT_TIMEOUT_MS });
    return stdout;
  } catch (error) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr).trim() : "";
    throw new GitError(`git ${args[0]} failed: ${stderr || (error instanceof Error ? error.message : String(error))}`, {
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
