import { fetchText, jsonRequest } from "@/ui/useJson";
import { appName } from "@/ui/fileManager";
import { reportFailure } from "@/ui/notices";
import type { Translate } from "@/ui/i18n/translate";

/**
 * ### openAgentFolderIn
 *
 * Opens an agent's working directory in a desktop app on the machine running
 * mothership; the server only ever opens that agent's own folder. A failure
 * shows as a notice.
 */
export function openAgentFolderIn(agentId: string, app: "terminal" | "vscode" | "finder", t: Translate): void {
  void fetchText(`/api/agents/${agentId}/open`, jsonRequest("POST", { app })).then((result) =>
    reportFailure(t("sessions.action.openFailed", { app: appName(app) }), result),
  );
}
