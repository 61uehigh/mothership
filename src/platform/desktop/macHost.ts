import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { DesktopApp, DesktopHost } from "@/platform/desktop/DesktopHost";
import { HttpError } from "@/platform/http/HttpError";

const run = promisify(execFile);

/** `open -a` arguments per app; the folder is appended. */
const APPS: Record<Exclude<DesktopApp, "finder">, Array<string>> = { terminal: ["-a", "Terminal"], vscode: ["-a", "Visual Studio Code"] };

/** AppleScript's error number when you press Cancel. */
const USER_CANCELED = "-128";

// The folders come in as arguments, never as script text.
const PICK_FOLDER = `on run argv
  activate
  set picked to choose folder with prompt (item 1 of argv) default location (POSIX file (item 2 of argv))
  return POSIX path of picked
end run`;

/**
 * ### shellQuote
 *
 * @returns `value` as one word for a POSIX shell.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * ### macHost
 *
 * The {@link DesktopHost} on macOS: `open`, and AppleScript for Terminal and
 * the folder picker.
 */
export const macHost: DesktopHost = {
  async openIn(app, target, isFolder) {
    if (app === "finder") {
      await run("open", isFolder ? [target] : ["-R", target]);
      return;
    }
    await run("open", [...APPS[app], isFolder || app === "vscode" ? target : path.dirname(target)]);
  },

  async openInTerminal(argv) {
    const command = argv.map(shellQuote).join(" ");
    const script = command.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    await run("osascript", ["-e", `tell application "Terminal" to do script "${script}"`, "-e", 'tell application "Terminal" to activate']);
  },

  async chooseFolder(prompt, start) {
    try {
      const { stdout } = await run("osascript", ["-e", PICK_FOLDER, prompt, start]);
      const picked = stdout.trim();
      // POSIX paths of folders end with "/"; keep "/" itself.
      return picked.length > 1 ? picked.replace(/\/$/, "") : picked;
    } catch (error) {
      if (error instanceof Error && "stderr" in error && String(error.stderr).includes(USER_CANCELED)) return undefined;
      throw error;
    }
  },

  async startDocker() {
    try {
      await run("open", ["-a", "Docker"]);
    } catch (error) {
      // `open -a` fails when no application of that name is installed.
      throw new HttpError("Docker Desktop isn't installed", 404, "docker-desktop-missing", { cause: error });
    }
  },

  async openUrl(url) {
    try {
      await run("open", [url]);
    } catch (error) {
      // `open` fails when no application is registered for the scheme.
      throw new HttpError(`No app opens ${new URL(url).protocol} links`, 404, undefined, { cause: error });
    }
  },
};
