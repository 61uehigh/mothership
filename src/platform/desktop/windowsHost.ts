import { execFile, spawn, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { HttpError } from "@/platform/http/HttpError";
import type { DesktopHost } from "@/platform/desktop/DesktopHost";
import { isMissingFile } from "@/lib/errors";

const run = promisify(execFile);
const win = path.win32;

/**
 * Shows the folder picker. The prompt and start folder come in through the
 * environment, never as script text; the answer is written as UTF-8 so
 * non-ASCII folder names survive the console's code page.
 */
const PICK_FOLDER = `
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = $env:MOTHERSHIP_PICK_PROMPT
$dialog.SelectedPath = $env:MOTHERSHIP_PICK_START
$dialog.ShowNewFolderButton = $true
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }
`;

/**
 * ### cmdLine
 *
 * Joins `argv` into one command line for `cmd.exe /k`. Words with spaces are
 * quoted, and the whole line is quoted once more because `cmd` strips the
 * outermost pair of quotes.
 *
 * @throws {@link HttpError} 400 when a word holds a quote, which `cmd` cannot escape.
 */
export function cmdLine(argv: ReadonlyArray<string>): string {
  if (argv.some((word) => word.includes('"'))) throw new HttpError("This command can't be opened in a terminal window", 400);
  return `"${argv.map((word) => (/[\s&|<>^()]/.test(word) || word === "" ? `"${word}"` : word)).join(" ")}"`;
}

/**
 * ### vscodeCandidates
 *
 * Where the VS Code installers put `Code.exe`: per user, then for everyone.
 * `code` on PATH is a `.cmd` script, which Node does not run without a shell.
 */
export function vscodeCandidates(env: Partial<Record<string, string>>): Array<string> {
  return [
    env.LOCALAPPDATA && win.join(env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
    win.join(env.ProgramFiles ?? "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate !== "");
}

/**
 * ### urlProtocolKey
 *
 * The registry key an app registers to open links of `url`'s scheme
 * (`HKCR\kakaotalk` for `kakaotalk://`).
 *
 * @throws {@link HttpError} 400 for a scheme that is not plain letters, digits, `+`, `-` or `.`,
 *   or a single letter (a drive, as in `C:\`).
 */
export function urlProtocolKey(url: string): string {
  const scheme = /^([a-z][a-z0-9+.-]+):/i.exec(url)?.[1];
  if (scheme === undefined) throw new HttpError("Not a link this app can open", 400);
  return `HKCR\\${scheme}`;
}

/**
 * Starts a program on its own and resolves once it started. With `detached`,
 * a console program gets its own window.
 */
function launch(file: string, args: ReadonlyArray<string>, options: SpawnOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: "ignore", ...options });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}


/** A new console window in `folder`: Windows Terminal when installed, else Command Prompt. */
async function terminalAt(folder: string): Promise<void> {
  try {
    await launch("wt.exe", ["-d", folder]);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    await launch("cmd.exe", [], { cwd: folder });
  }
}

/**
 * ### windowsHost
 *
 * The {@link DesktopHost} on Windows: File Explorer, Windows Terminal or
 * Command Prompt, VS Code from its install folder, and PowerShell's folder picker.
 */
export const windowsHost: DesktopHost = {
  async openIn(app, target, isFolder) {
    if (app === "finder") {
      // Explorer exits with 1 even when it worked, so its exit code is not checked.
      await launch("explorer.exe", isFolder ? [target] : [`/select,"${target}"`], { windowsVerbatimArguments: !isFolder });
      return;
    }
    if (app === "terminal") {
      await terminalAt(isFolder ? target : win.dirname(target));
      return;
    }
    const code = vscodeCandidates(process.env).find((candidate) => existsSync(candidate));
    if (code === undefined) throw new HttpError("VS Code isn't installed in its usual folder", 404, "vscode-missing");
    await launch(code, [target]);
  },

  async openInTerminal(argv) {
    await launch("cmd.exe", ["/d", "/k", cmdLine(argv)], { windowsVerbatimArguments: true });
  },

  async chooseFolder(prompt, start) {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", PICK_FOLDER], {
      env: { ...process.env, MOTHERSHIP_PICK_PROMPT: prompt, MOTHERSHIP_PICK_START: start },
      encoding: "utf8",
      windowsHide: true,
    });
    const picked = stdout.trim();
    return picked === "" ? undefined : picked;
  },

  async startDocker() {
    const exe = win.join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");
    if (!existsSync(exe)) throw new HttpError("Docker Desktop isn't installed in its usual folder", 404, "docker-desktop-missing");
    await launch(exe, []);
  },

  async openUrl(url) {
    // Opening a link with no handler still succeeds (Windows asks which app to use), so the registration is checked first.
    const key = urlProtocolKey(url);
    try {
      await run("reg.exe", ["query", key, "/v", "URL Protocol"], { windowsHide: true });
    } catch (error) {
      throw new HttpError(`No app opens ${key.slice("HKCR\\".length)}: links`, 404, undefined, { cause: error });
    }
    await launch("rundll32.exe", ["url.dll,FileProtocolHandler", url]);
  },
};
