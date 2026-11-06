// Shared plumbing for the read-only CLI wrappers (features/github/server/gh.ts, features/docker/server/cli.ts).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);

/**
 * ### CliOutcome
 *
 * One attempt to run a CLI binary:
 * - `ok`: it exited 0 with `value`.
 * - `missing`: the binary does not exist at that path.
 * - `failed`: it ran and failed; `stderr` is trimmed, `cause` is the original error.
 */
export type CliOutcome<T> = { kind: "ok"; value: T } | { kind: "missing" } | { kind: "failed"; stderr: string; cause: unknown };

/**
 * ### CliRunOptions
 *
 * Options for {@link CliBinary.run}.
 */
export type CliRunOptions = {
  /**
   * ### env
   *
   * The child's environment.
   */
  env: NodeJS.ProcessEnv;
  /**
   * ### timeoutMs
   *
   * Kills the command after this long.
   */
  timeoutMs: number;
  /**
   * ### maxBuffer
   *
   * Largest stdout or stderr accepted, in bytes.
   */
  maxBuffer: number;
};

/**
 * ### isMissingBinary
 *
 * Whether a spawn error means the binary does not exist (`ENOENT`).
 */
export function isMissingBinary(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && String(error.code) === "ENOENT";
}

function errorStderr(error: unknown): string {
  return typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";
}

/**
 * ### failureDetail
 *
 * What to show for a failed command: its stderr, or else the error message.
 */
export function failureDetail(stderr: string, cause: unknown): string {
  return stderr || (cause instanceof Error ? cause.message : String(cause));
}

/**
 * ### CliBinary
 *
 * A CLI found by trying candidate paths in order (the dev server's PATH may
 * not include Homebrew or Docker Desktop's bin folder). The first candidate
 * that exists is remembered for later calls.
 */
export class CliBinary {
  private resolved: string | undefined;

  /**
   * @param candidates - Binary names or absolute paths, tried in order.
   */
  constructor(private readonly candidates: ReadonlyArray<string>) {}

  /**
   * ### attempt
   *
   * Runs `start` with each candidate until one exists.
   *
   * @returns The first outcome that is not `missing`, or `missing` when no candidate exists.
   */
  async attempt<T>(start: (binary: string) => Promise<CliOutcome<T>>): Promise<CliOutcome<T>> {
    for (const binary of this.resolved === undefined ? this.candidates : [this.resolved]) {
      const outcome = await start(binary);
      if (outcome.kind === "missing") continue;
      this.resolved = binary;
      return outcome;
    }
    return { kind: "missing" };
  }

  /**
   * ### run
   *
   * Runs the CLI with arguments passed directly (no shell).
   *
   * @returns The command's stdout as `value`, or why it did not run.
   */
  run(args: Array<string>, options: CliRunOptions): Promise<CliOutcome<string>> {
    return this.attempt(async (binary): Promise<CliOutcome<string>> => {
      try {
        const { stdout } = await run(binary, args, {
          encoding: "utf8",
          env: options.env,
          timeout: options.timeoutMs,
          maxBuffer: options.maxBuffer,
        });
        return { kind: "ok", value: stdout };
      } catch (error) {
        if (isMissingBinary(error)) return { kind: "missing" };
        return { kind: "failed", stderr: errorStderr(error).trim(), cause: error };
      }
    });
  }
}

/**
 * ### parseCliJson
 *
 * Parses a command's JSON output and validates it.
 *
 * @param label - The command for messages, e.g. `gh pr`.
 * @param fail - Builds the tool's own error.
 * @throws What `fail` returns, when the text is not JSON or does not match `schema`.
 */
export function parseCliJson<T>(text: string, schema: z.ZodType<T>, label: string, fail: (message: string, options?: ErrorOptions) => Error): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw fail(`${label} printed invalid JSON`, { cause: error });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw fail(`Unexpected output from ${label}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}
