import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { HttpError } from "@/platform/http/HttpError";

const run = promisify(execFile);

/** AppleScript's error number when you press Cancel. */
const USER_CANCELED = "-128";

// The folders come in as arguments, never as script text.
const SCRIPT = `on run argv
  activate
  set picked to choose folder with prompt (item 1 of argv) default location (POSIX file (item 2 of argv))
  return POSIX path of picked
end run`;

/**
 * ### chooseFolder
 *
 * Shows the macOS folder picker on this Mac and waits for your choice.
 *
 * @param prompt - The line shown at the top of the picker.
 * @param start - The folder it opens in; your home folder when missing or not a folder.
 * @returns The chosen folder, or `undefined` when you cancel.
 * @throws {@link HttpError} 501 off macOS.
 */
export async function chooseFolder(prompt: string, start?: string): Promise<string | undefined> {
  if (process.platform !== "darwin") throw new HttpError("Choosing a folder is only supported on macOS", 501);
  const isFolder = start !== undefined && (await stat(/*turbopackIgnore: true*/ start).then((s) => s.isDirectory(), () => false));
  try {
    const { stdout } = await run("osascript", ["-e", SCRIPT, prompt, isFolder ? start : homedir()]);
    const picked = stdout.trim();
    // POSIX paths of folders end with "/"; keep "/" itself.
    return picked.length > 1 ? picked.replace(/\/$/, "") : picked;
  } catch (error) {
    if (error instanceof Error && "stderr" in error && String(error.stderr).includes(USER_CANCELED)) return undefined;
    throw error;
  }
}
