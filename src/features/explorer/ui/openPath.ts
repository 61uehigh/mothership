import { fetchText, jsonRequest } from "@/ui/useJson";
import { reportFailure } from "@/ui/notices";

const APP_NAMES = { terminal: "Terminal", vscode: "VS Code", finder: "Finder" } as const;

/**
 * ### openPathIn
 *
 * Opens a folder or file under an explorer root in a desktop app on the
 * machine running mothership. A failure shows as a notice, like `openIn`.
 *
 * @param root - An agent id, `"workspace"`, or `"local"`.
 * @param relative - Path under the root; `""` for the root itself.
 */
export function openPathIn(root: string, relative: string, app: "terminal" | "vscode" | "finder"): void {
  void fetchText("/api/files/open", jsonRequest("POST", { root, path: relative, app })).then((result) =>
    reportFailure(`Couldn't open in ${APP_NAMES[app]}`, result),
  );
}
