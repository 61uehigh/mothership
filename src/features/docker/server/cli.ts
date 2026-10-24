import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { DockerErrorCode } from "@/features/docker/model/Docker";
import { HttpError } from "@/platform/http/HttpError";
import { CliBinary, failureDetail, isMissingBinary, parseCliJson, type CliOutcome } from "@/platform/cli";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 500;
/** Tried in order; the dev server's PATH may not include Docker Desktop's bin folder. */
const DOCKER = new CliBinary(["docker", join(homedir(), ".docker/bin/docker"), "/usr/local/bin/docker", "/opt/homebrew/bin/docker"]);
/** Printed by the CLI in several wordings when Docker Desktop (or dockerd) is not running. */
const DAEMON_DOWN = /Cannot connect to the Docker daemon|Is the docker daemon running|if the daemon is running|error during connect/i;
/** HTTP status per failure kind: the CLI is missing or the daemon is down (503), anything else (502). */
const STATUS: Record<DockerErrorCode, number> = { missing: 503, daemon: 503, failed: 502 };

/**
 * ### DockerError
 *
 * A `docker` command failed or printed something unexpected. The message is
 * meant to be shown to the user. Routes answer it as `{ error, code }` with
 * 503 when the CLI is missing or the daemon is down, 502 otherwise.
 */
export class DockerError extends HttpError {
  /**
   * ### code
   *
   * The kind of failure, so the UI can explain how to fix it.
   */
  declare readonly code: DockerErrorCode;

  constructor(code: DockerErrorCode, message: string, options?: ErrorOptions) {
    super(message, STATUS[code], code, options);
    this.name = "DockerError";
  }
}

function dockerEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DOCKER_CLI_HINTS: "false", NO_COLOR: "1" };
}

/** Turns a non-`ok` outcome into the error to throw. */
function failure(args: Array<string>, outcome: Exclude<CliOutcome<unknown>, { kind: "ok" }>): DockerError {
  if (outcome.kind === "missing") {
    return new DockerError(
      "missing",
      "The Docker CLI is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop, then refresh.",
    );
  }
  const { stderr, cause } = outcome;
  if (DAEMON_DOWN.test(stderr)) {
    return new DockerError("daemon", "The Docker daemon is not running. Start Docker Desktop, then refresh.", { cause });
  }
  const full = failureDetail(stderr, cause);
  const detail = full.length > MAX_ERROR_CHARS ? `…${full.slice(-MAX_ERROR_CHARS)}` : full;
  return new DockerError("failed", `docker ${args[0]} failed: ${detail}`, { cause });
}

/**
 * ### docker
 *
 * Runs the Docker CLI with arguments passed directly (no shell). Callers must
 * only pass subcommands they mean to allow.
 *
 * @returns The command's stdout.
 * @throws {@link DockerError} When `docker` is missing, the daemon is down, or the command fails.
 */
export async function docker(args: Array<string>): Promise<string> {
  const outcome = await DOCKER.run(args, { maxBuffer: MAX_OUTPUT_BYTES, timeoutMs: TIMEOUT_MS, env: dockerEnv() });
  if (outcome.kind !== "ok") throw failure(args, outcome);
  return outcome.value;
}

function parseJson<T>(args: Array<string>, text: string, schema: z.ZodType<T>): T {
  return parseCliJson(text, schema, `docker ${args[0]}`, (message, options) => new DockerError("failed", message, options));
}

/**
 * ### dockerJsonLines
 *
 * Runs `docker` with `--format '{{json .}}'` style output (one JSON object
 * per line) and validates each line.
 *
 * @returns The parsed lines, in output order.
 * @throws {@link DockerError} When the command fails or a line does not match `schema`.
 */
export async function dockerJsonLines<T>(args: Array<string>, schema: z.ZodType<T>): Promise<Array<T>> {
  const stdout = await docker(args);
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => parseJson(args, line, schema));
}

/**
 * ### dockerJson
 *
 * Runs `docker` with a single JSON document as output and validates it.
 *
 * @returns The parsed output.
 * @throws {@link DockerError} When the command fails or its output does not match `schema`.
 */
export async function dockerJson<T>(args: Array<string>, schema: z.ZodType<T>): Promise<T> {
  return parseJson(args, await docker(args), schema);
}

type MergedOutput = { text: string; truncated: boolean };

function spawnMerged(bin: string, args: Array<string>, capBytes: number): Promise<CliOutcome<MergedOutput>> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { env: dockerEnv(), stdio: ["ignore", "pipe", "pipe"] });
    const lines: Array<string> = [];
    let bytes = 0;
    let truncated = false;
    const partial = { stdout: "", stderr: "" };

    const push = (line: string) => {
      lines.push(line);
      bytes += Buffer.byteLength(line) + 1;
      while (bytes > capBytes && lines.length > 1) {
        const dropped = lines.shift() ?? "";
        bytes -= Buffer.byteLength(dropped) + 1;
        truncated = true;
      }
    };
    // Split per stream so a line from one stream never lands inside a line of the other.
    const onData = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const parts = (partial[stream] + chunk.toString("utf8")).split("\n");
      partial[stream] = parts.pop() ?? "";
      for (const line of parts) push(line);
    };
    child.stdout.on("data", onData("stdout"));
    child.stderr.on("data", onData("stderr"));

    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve(isMissingBinary(error) ? { kind: "missing" } : { kind: "failed", stderr: "", cause: error });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      for (const rest of [partial.stdout, partial.stderr]) if (rest !== "") push(rest);
      const text = lines.join("\n");
      // A failed `docker logs` prints its own error on stderr, which is now at the end of `text`.
      if (code !== 0) resolve({ kind: "failed", stderr: text.trim(), cause: new Error(`docker exited with code ${code ?? "unknown"}`) });
      else resolve({ kind: "ok", value: { text, truncated } });
    });
  });
}

/**
 * ### dockerMergedOutput
 *
 * Runs `docker` and collects stdout and stderr as one text, line by line in
 * the order they arrive (used for `docker logs`, which replays a container's
 * two streams on the matching CLI streams). Only the last `capBytes` are kept.
 *
 * @returns The merged output and whether older lines were dropped.
 * @throws {@link DockerError} When `docker` is missing, the daemon is down, or the command fails.
 */
export async function dockerMergedOutput(args: Array<string>, capBytes: number): Promise<MergedOutput> {
  const outcome = await DOCKER.attempt((binary) => spawnMerged(binary, args, capBytes));
  if (outcome.kind !== "ok") throw failure(args, outcome);
  return outcome.value;
}

/**
 * ### checkDocker
 *
 * @returns Whether the Docker CLI is installed and its daemon is running.
 */
export async function checkDocker(): Promise<{ ready: boolean; detail: string; fix?: "install" | "start" }> {
  try {
    const version = (await docker(["version", "--format", "{{.Server.Version}}"])).trim();
    return { ready: true, detail: `Docker ${version} is running.` };
  } catch (error) {
    if (error instanceof DockerError && error.code === "missing") return { ready: false, detail: "Docker is not installed.", fix: "install" };
    if (error instanceof DockerError && error.code === "daemon") return { ready: false, detail: "Docker is installed but not running.", fix: "start" };
    return { ready: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
