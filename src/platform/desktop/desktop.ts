import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { HttpError } from "@/platform/http/HttpError";
import type { DesktopApp, DesktopHost } from "@/platform/desktop/DesktopHost";
import { macHost } from "@/platform/desktop/macHost";
import { windowsHost } from "@/platform/desktop/windowsHost";

export type { DesktopApp } from "@/platform/desktop/DesktopHost";

const isDirectory = (target: string) => stat(/*turbopackIgnore: true*/ target).then((s) => s.isDirectory(), () => false);

/**
 * ### desktopHost
 *
 * The {@link DesktopHost} for the computer the server runs on.
 *
 * @throws {@link HttpError} 501 on anything but macOS and Windows.
 */
export function desktopHost(): DesktopHost {
  if (process.platform === "darwin") return macHost;
  if (process.platform === "win32") return windowsHost;
  throw new HttpError("Opening desktop apps is only supported on macOS and Windows", 501, "desktop-unsupported");
}

/**
 * ### openIn
 *
 * Opens a folder or file in a terminal, VS Code, or the file manager on the
 * computer running mothership. Callers check the path is one they may open.
 *
 * @throws {@link HttpError} 501 on other systems.
 */
export async function openIn(app: DesktopApp, target: string): Promise<void> {
  const host = desktopHost();
  await host.openIn(app, target, await isDirectory(target));
}

/**
 * ### openInTerminal
 *
 * Opens a new terminal window running `argv` (Terminal on a Mac, Command
 * Prompt on Windows). Only pass commands built by the app.
 *
 * @throws {@link HttpError} 501 on other systems.
 */
export function openInTerminal(argv: ReadonlyArray<string>): Promise<void> {
  return desktopHost().openInTerminal(argv);
}

/**
 * ### chooseFolder
 *
 * Shows the system's folder picker and waits for your choice.
 *
 * @param prompt - The line shown in the picker.
 * @param start - The folder it opens in; your home folder when missing or not a folder.
 * @returns The chosen folder, or `undefined` when you cancel.
 * @throws {@link HttpError} 501 on other systems.
 */
export async function chooseFolder(prompt: string, start?: string): Promise<string | undefined> {
  const host = desktopHost();
  return host.chooseFolder(prompt, start !== undefined && (await isDirectory(start)) ? start : homedir());
}

/**
 * ### openUrl
 *
 * Opens a link built by the app (such as `kakaotalk://`) in the app
 * registered for its scheme.
 *
 * @throws {@link HttpError} 501 on other systems; 404 when no app is registered for the scheme.
 */
export function openUrl(url: string): Promise<void> {
  return desktopHost().openUrl(url);
}

/**
 * ### startDockerDesktop
 *
 * @throws {@link HttpError} 501 on other systems; 404 when Docker Desktop is not installed (Windows).
 */
export function startDockerDesktop(): Promise<void> {
  return desktopHost().startDocker();
}
