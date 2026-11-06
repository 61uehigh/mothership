"use client";

import { Bot } from "lucide-react";
import { fetchText, useJson, type Fetched } from "@/ui/useJson";
import { FRAME_BUTTON } from "@/shell/TabFrame";

/**
 * ### useToolDocument
 *
 * Fetches one JSON document from our own `/api/tools/*` routes. A reload
 * asks the route for fresh data (`refresh=1`, which routes with a server
 * cache such as Slack and Calendar honour) for the URL it was clicked on;
 * moving to another URL loads normally.
 *
 * @param url - Same-origin API URL; changing it reloads. `undefined` waits without loading.
 * @returns The document state and a reload action.
 */
export function useToolDocument<T>(url: string | undefined): Fetched<T> {
  return useJson<T>(url, { refreshOnReload: true });
}

/**
 * ### HandOffButton
 *
 * "Hand off to an agent" in a tool tab's header.
 *
 * @param onHandOff - `undefined` (disabled) until the document has loaded.
 */
export function HandOffButton({ onHandOff }: { onHandOff: (() => void) | undefined }) {
  return (
    <button type="button" className={FRAME_BUTTON} disabled={onHandOff === undefined} onClick={onHandOff}>
      <Bot size={12} aria-hidden />
      Hand off to an agent
    </button>
  );
}

/**
 * ### postTool
 *
 * POSTs JSON to one of our own `/api/tools/*` write routes.
 *
 * @throws Error With the route's `{ error }` message when it fails.
 */
export async function postTool(url: string, body: Record<string, unknown>): Promise<void> {
  // Read as text: callers only need success, and some routes answer with an empty body.
  const result = await fetchText(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!result.ok) throw new Error(result.error);
}
