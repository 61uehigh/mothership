/**
 * ### openIn
 *
 * Opens an agent's working directory in a desktop app on the machine running
 * mothership. Fire-and-forget: the server only ever opens that agent's own folder.
 */
export function openIn(agentId: string, app: "terminal" | "vscode" | "finder"): void {
  void fetch(`/api/agents/${agentId}/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app }),
  });
}
