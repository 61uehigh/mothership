/**
 * ### openPathIn
 *
 * Opens a folder or file under an explorer root in a desktop app on the
 * machine running mothership. Fire-and-forget, like `openIn`.
 *
 * @param root - An agent id, `"workspace"`, or `"local"`.
 * @param relative - Path under the root; `""` for the root itself.
 */
export function openPathIn(root: string, relative: string, app: "terminal" | "vscode" | "finder"): void {
  void fetch("/api/files/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root, path: relative, app }),
  });
}
