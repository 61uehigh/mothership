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
    if ((env.GOOGLE_OAUTH_CREDENTIALS ?? "") === "") throw new HttpError("Choose the OAuth client file first.", 409);
    this.#child?.kill();
    const startedAt = Date.now();
    this.#state = { state: "waiting", url: undefined, startedAt };
    const child = spawn(command, [...args, "auth"], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
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
      child.kill();
      this.#state = { state: "failed", message: "The sign-in page was left open too long. Start again.", finishedAt: Date.now() };
    }, SIGN_IN_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!current()) return;
      this.#child = undefined;
      this.#state = { state: "failed", message: `Could not start the sign-in: ${error.message}`, finishedAt: Date.now() };
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!current()) return;
      this.#child = undefined;
      if (this.#state.state !== "waiting") return;
      this.#state =
        code === 0
          ? { state: "done", finishedAt: Date.now() }
          : { state: "failed", message: lastUsefulLine(output) ?? `The sign-in stopped (exit code ${code}).`, finishedAt: Date.now() };
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
    child?.kill();
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
  if (server?.transport !== "stdio") throw new HttpError("config/mcp.yaml has no google_calendar server to sign in to.", 409);
  return { command: server.command, args: server.args, env: { GOOGLE_OAUTH_CREDENTIALS: process.env.GOOGLE_OAUTH_CREDENTIALS ?? "" } };
}
