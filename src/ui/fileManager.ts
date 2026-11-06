import { hostPlatform } from "@/ui/hostPlatform";

/**
 * ### fileManagerName
 *
 * The file manager of the computer the app runs on: File Explorer on
 * Windows, else Finder. Reads {@link hostPlatform}, so server rendering and
 * the first browser render agree.
 */
export function fileManagerName(): "Finder" | "File Explorer" {
  return hostPlatform() === "win32" ? "File Explorer" : "Finder";
}

/**
 * ### appName
 *
 * A desktop app's name as buttons and notices show it; the file manager's
 * differs per OS (see {@link fileManagerName}).
 */
export function appName(app: "terminal" | "vscode" | "finder"): string {
  if (app === "finder") return fileManagerName();
  return app === "vscode" ? "VS Code" : "Terminal";
}
