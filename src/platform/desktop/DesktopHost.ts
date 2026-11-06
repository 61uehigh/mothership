/**
 * ### DesktopApp
 *
 * A desktop app a folder can be opened in: a terminal, VS Code, or the file
 * manager (Finder on a Mac, File Explorer on Windows). `finder` names the
 * file manager on every system: the id predates Windows support and is sent
 * by the UI, so it was kept rather than renamed.
 */
export type DesktopApp = "terminal" | "vscode" | "finder";

/**
 * ### DesktopHost
 *
 * What the server asks of the computer it runs on, one implementation per
 * operating system (`macHost`, `windowsHost`). Callers go through
 * `desktop.ts`, which picks the host and answers 501 elsewhere.
 */
export type DesktopHost = {
  /**
   * ### openIn
   *
   * Opens `target` in `app`. A terminal opens in `target`'s folder when it is
   * a file; the file manager shows a file selected in its folder.
   */
  openIn(app: DesktopApp, target: string, isFolder: boolean): Promise<void>;
  /**
   * ### openInTerminal
   *
   * Opens a new terminal window running `argv`, for steps that need you (a
   * login through a browser). Only commands built by the app, never text from
   * a request.
   */
  openInTerminal(argv: ReadonlyArray<string>): Promise<void>;
  /**
   * ### chooseFolder
   *
   * Shows the system's folder picker, starting in `start`, and waits.
   *
   * @returns The chosen folder, or `undefined` when you cancel.
   */
  chooseFolder(prompt: string, start: string): Promise<string | undefined>;
  /**
   * ### startDocker
   *
   * Starts Docker Desktop.
   */
  startDocker(): Promise<void>;
  /**
   * ### openUrl
   *
   * Opens a link (such as an app's own `kakaotalk://` scheme) in the app
   * registered for it. Only links built by the app, never text from a request.
   *
   * @throws {@link HttpError} 404 when no app is registered for the link's scheme.
   */
  openUrl(url: string): Promise<void>;
};
