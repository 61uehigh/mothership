import { fetchText, jsonRequest } from "@/ui/useJson";
import { appName } from "@/ui/fileManager";
import { reportFailure } from "@/ui/notices";
import type { Translate } from "@/ui/i18n/translate";
import type { FilesErrorCode } from "@/features/explorer/model/Files";
import { filesFailureText } from "@/features/explorer/ui/filesFailureText";

/**
 * ### openPathIn
 *
 * Opens a folder or file under an explorer root in a desktop app on the
 * machine running mothership. A failure shows as a notice, like `openAgentFolderIn`.
 *
 * @param root - An agent id, `"workspace"`, or `"local"`.
 * @param relative - Path under the root; `""` for the root itself.
 */
export function openPathIn(root: string, relative: string, app: "terminal" | "vscode" | "finder", t: Translate): void {
  void fetchText<FilesErrorCode>("/api/files/open", jsonRequest("POST", { root, path: relative, app })).then((result) =>
    reportFailure(t("explorer.openFailed", { app: appName(app) }), result.ok ? result : { ...result, error: filesFailureText(t, result, relative) }),
  );
}
