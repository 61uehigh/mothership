import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HttpError } from "@/platform/http/HttpError";

const run = promisify(execFile);

/**
 * ### shellQuote
 *
 * @returns `value` as one word for a POSIX shell.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * ### openInTerminal
 *
 * Opens a new Terminal window on this Mac running `command`, for steps that
 * need you, such as logging in through a browser. Only pass commands built
 * by the app, never text from a request.
 *
 * @throws {@link HttpError} 501 off macOS.
 */
export async function openInTerminal(command: string): Promise<void> {
  if (process.platform !== "darwin") throw new HttpError("Opening Terminal is only supported on macOS", 501);
  const script = command.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  await run("osascript", ["-e", `tell application "Terminal" to do script "${script}"`, "-e", 'tell application "Terminal" to activate']);
}
