import { spawn, type ChildProcess } from "node:child_process";
import type { GoogleSignInState } from "@/features/settings/model/Settings";
import { HttpError } from "@/platform/http/HttpError";
import { readMcpFile } from "@/platform/mcp/mcpConfig";

/** How long the sign-in page stays usable before Settings gives up on it. */
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;
const URL_LINE = /Authentication URL:\s*(https:\/\/accounts\.google\.com\/\S+)/;

/**
 * ### SignInCommand
 *
 * The Google Calendar MCP server's command, from `config/mcp.yaml`; `auth` is added to it.
 */
export type SignInCommand = { command: string; args: Array<string>; env: Record<string, string> };

/**
 * ### lastUsefulLine
 *
 * @returns The last line of a sign-in's output worth showing, without the usage banner.
 */
export function lastUsefulLine(output: string): string | undefined {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("npm ") && !URL_LINE.test(line))
    .at(-1);
}

const CMD_SAFE = /^[\w\-.:/\\@=+,]+$/;

/**
 * ### signInSpawnPlan
 *
 * How to start the sign-in command on `platform`. On Windows, `npx` and
 * other npm commands are `.cmd` shims, which `spawn` cannot start without a
 * shell, so the command goes through `cmd.exe` with each argument quoted.
 *
 * @returns The file and arguments for `spawn`, and whether they must be passed verbatim.
 */
export function signInSpawnPlan(command: string, args: Array<string>, platform: NodeJS.Platform): { file: string; args: Array<string>; verbatim: boolean } {
  if (platform !== "win32") return { file: command, args, verbatim: false };
  const line = [command, ...args].map((part) => (CMD_SAFE.test(part) ? part : `"${part.replaceAll('"', '""')}"`)).join(" ");
  return { file: "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
}

/** On Windows `kill` stops only the `cmd.exe` wrapper, leaving `node` and its loopback port behind, so the whole tree is stopped. */
function stop(child: ChildProcess | undefined): void {
  if (child === undefined) return;
  if (process.platform === "win32" && child.pid !== undefined && child.exitCode === null) {
    spawn("taskkill.exe", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" }).once("error", () => child.kill());
  } else {
    child.kill();
  }
}

/**
 * ### GoogleSignIn
 *
 * Runs `google-calendar-mcp auth` for you: it opens Google's sign-in page in
 * your browser and saves the sign-in when you finish. One at a time; starting
 * again replaces a sign-in still waiting.
 */
export class GoogleSignIn {
  #state: GoogleSignInState = { state: "idle" };
  #child: ChildProcess | undefined;

  /**
   * ### status
   *
   * @returns The current sign-in; `waiting` has no `url` until the command prints it.
   */
  status(): GoogleSignInState {
    return this.#state;
  }

  /**
   * ### start
   *
   * @throws {@link HttpError} 409 when no OAuth client file is set.
   */
  start({ command, args, env }: SignInCommand): GoogleSignInState {
    if ((env.GOOGLE_OAUTH_CREDENTIALS ?? "") === "") throw new HttpError("Choose the OAuth client file first.", 409, "oauth-client-not-chosen");
    stop(this.#child);
    const startedAt = Date.now();
    this.#state = { state: "waiting", url: undefined, startedAt };
    const plan = signInSpawnPlan(command, [...args, "auth"], process.platform);
    const child = spawn(plan.file, plan.args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsVerbatimArguments: plan.verbatim, windowsHide: true });
    this.#child = child;
    let output = "";
    const current = () => this.#child === child;
    const onData = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-8192);
      const url = URL_LINE.exec(output)?.[1];
      if (url !== undefined && current() && this.#state.state === "waiting") this.#state = { ...this.#state, url };
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    const timer = setTimeout(() => {
      if (!current()) return;
      stop(child);
      this.#state = { state: "failed", code: "sign-in-timed-out", finishedAt: Date.now() };
    }, SIGN_IN_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!current()) return;
      this.#child = undefined;
      this.#state = { state: "failed", code: "sign-in-not-started", output: error.message, finishedAt: Date.now() };
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!current()) return;
      this.#child = undefined;
      if (this.#state.state !== "waiting") return;
      this.#state =
        code === 0
          ? { state: "done", finishedAt: Date.now() }
          : { state: "failed", code: "sign-in-stopped", output: lastUsefulLine(output), exitCode: code ?? undefined, finishedAt: Date.now() };
    });
    return this.#state;
  }

  /**
   * ### cancel
   *
   * Stops a running sign-in. A finished one keeps its `done` or `failed` state.
   */
  cancel(): GoogleSignInState {
    const child = this.#child;
    this.#child = undefined;
    stop(child);
    if (this.#state.state === "waiting") this.#state = { state: "idle" };
    return this.#state;
  }
}

/**
 * ### calendarSignInCommand
 *
 * The Google Calendar MCP server signs you in itself; this runs its own
 * command with the OAuth client file you chose.
 *
 * @returns The `google_calendar` server's command from `config/mcp.yaml`, with your OAuth client file.
 * @throws {@link HttpError} 409 when the config has no stdio `google_calendar` server.
 */
export async function calendarSignInCommand(): Promise<SignInCommand> {
  const server = (await readMcpFile()).config.servers.google_calendar;
  if (server?.transport !== "stdio") throw new HttpError("config/mcp.yaml has no google_calendar server to sign in to.", 409, "calendar-server-missing");
  return { command: server.command, args: server.args, env: { GOOGLE_OAUTH_CREDENTIALS: process.env.GOOGLE_OAUTH_CREDENTIALS ?? "" } };
}
