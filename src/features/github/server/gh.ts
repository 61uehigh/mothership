import { z } from "zod";
import type { GhErrorCode } from "@/features/github/model/GitHub";
import { HttpError } from "@/platform/http/HttpError";
import { CliBinary, failureDetail, parseCliJson } from "@/platform/cli";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
/** Tried in order; the dev server's PATH may not include Homebrew. */
const GH = new CliBinary(["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]);
/** HTTP status per failure kind: not logged in, not installed, anything else. */
const STATUS: Record<GhErrorCode, number> = { auth: 401, missing: 503, failed: 502 };

/**
 * ### GhError
 *
 * A `gh` command failed or printed something unexpected. The message is
 * meant to be shown to the user. Routes answer it as `{ error, code }` with
 * 401 when not logged in, 503 when gh is missing, 502 otherwise.
 */
export class GhError extends HttpError {
  /**
   * ### code
   *
   * The kind of failure, so the UI can explain how to fix it.
   */
  declare readonly code: GhErrorCode;

  constructor(code: GhErrorCode, message: string, options?: ErrorOptions) {
    super(message, STATUS[code], code, options);
    this.name = "GhError";
  }
}

/**
 * ### gh
 *
 * Runs the GitHub CLI with arguments passed directly (no shell). Only
 * read-only subcommands should be passed here.
 *
 * @returns The command's stdout.
 * @throws {@link GhError} When `gh` is missing, not logged in, or fails.
 */
export async function gh(args: Array<string>): Promise<string> {
  const outcome = await GH.run(args, {
    maxBuffer: MAX_OUTPUT_BYTES,
    timeoutMs: TIMEOUT_MS,
    env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1" },
  });
  switch (outcome.kind) {
    case "ok":
      return outcome.value;
    case "missing":
      throw new GhError("missing", "The GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run `gh auth login`.");
    case "failed":
      if (/gh auth login|not logged in|authentication required|HTTP 401/i.test(outcome.stderr)) {
        throw new GhError("auth", "The GitHub CLI is not logged in. Run `gh auth login` in a terminal, then refresh.", { cause: outcome.cause });
      }
      throw new GhError("failed", `gh ${args[0]} failed: ${failureDetail(outcome.stderr, outcome.cause)}`, { cause: outcome.cause });
  }
}

/**
 * ### ghJson
 *
 * Runs `gh` with `--json` style output and validates it.
 *
 * @returns The parsed output.
 * @throws {@link GhError} When the command fails or its output does not match `schema`.
 */
export async function ghJson<T>(args: Array<string>, schema: z.ZodType<T>): Promise<T> {
  return parseCliJson(await gh(args), schema, `gh ${args[0]}`, (message, options) => new GhError("failed", message, options));
}

/**
 * ### checkGitHubCli
 *
 * @returns Whether the GitHub CLI is installed and logged in, and as whom.
 */
export async function checkGitHubCli(): Promise<{ ready: boolean; detail: string; fix?: "install" | "login" }> {
  try {
    const login = (await gh(["api", "user", "--jq", ".login"])).trim();
    return { ready: true, detail: `Logged in as ${login}.` };
  } catch (error) {
    if (error instanceof GhError && error.code === "missing") return { ready: false, detail: "The GitHub CLI (gh) is not installed.", fix: "install" };
    if (error instanceof GhError && error.code === "auth") return { ready: false, detail: "The GitHub CLI is not logged in.", fix: "login" };
    return { ready: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
