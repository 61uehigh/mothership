import { fetchText, jsonRequest } from "@/ui/useJson";
import { reportFailure } from "@/ui/notices";

const APP_NAMES = { terminal: "Terminal", vscode: "VS Code", finder: "Finder" } as const;

/**
 * ### openIn
 *
 * Opens an agent's working directory in a desktop app on the machine running
 * mothership; the server only ever opens that agent's own folder. A failure
 * shows as a notice.
 */
export function openIn(agentId: string, app: "terminal" | "vscode" | "finder"): void {
  void fetchText(`/api/agents/${agentId}/open`, jsonRequest("POST", { app })).then((result) => reportFailure(`Couldn't open in ${APP_NAMES[app]}`, result));
}
