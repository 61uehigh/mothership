"use client";

import { Bot } from "lucide-react";
import type { ToolKind } from "@/features/tools/model/Dashboard";
import { type Fetched, fetchText, jsonRequest, useJson } from "@/ui/useJson";
import { FRAME_BUTTON } from "@/shell/tabFrame";
import { toolLoadError } from "@/shell/toolFailureText";
import { pageLocale } from "@/ui/i18n/apiErrors";
import { translator } from "@/ui/i18n/translate";
import { useLocale, useT } from "@/ui/i18n/useT";

/**
 * ### useToolDocument
 *
 * Fetches one JSON document from our own `/api/tools/*` routes. A reload
 * asks the route for fresh data (`refresh=1`, which routes with a server
 * cache such as Slack and Calendar honour) for the URL it was clicked on;
 * moving to another URL loads normally.
 *
 * @param url - Same-origin API URL; changing it reloads. `undefined` waits without loading.
 * @param tool - The tool the route reads, to word its failures.
 * @returns The document state, with `error` in the chosen language, and a reload action.
 */
export function useToolDocument<T>(url: string | undefined, tool: ToolKind): Fetched<T> {
  const t = useT();
  const { locale } = useLocale();
  const fetched = useJson<T>(url, { refreshOnReload: true });
  return { ...fetched, error: toolLoadError(t, locale, fetched.failure, tool) };
}

/**
 * ### HandOffButton
 *
 * "Hand off to an agent" in a tool tab's header.
 *
 * @param onHandOff - `undefined` (disabled) until the document has loaded.
 */
export function HandOffButton({ onHandOff }: { onHandOff: (() => void) | undefined }) {
  const t = useT();
  return (
    <button type="button" className={FRAME_BUTTON} disabled={onHandOff === undefined} onClick={onHandOff}>
      <Bot size={12} aria-hidden />
      {t("tools.handOff")}
    </button>
  );
}

/**
 * ### postTool
 *
 * POSTs JSON to one of our own `/api/tools/*` write routes.
 *
 * @param tool - The tool the route writes to, to word its failures.
 * @throws Error With the failure in the UI's language when it fails.
 */
export async function postTool(tool: ToolKind, url: string, body: Record<string, unknown>): Promise<void> {
  // Read as text: callers only need success, and some routes answer with an empty body.
  const result = await fetchText(url, jsonRequest("POST", body));
  if (!result.ok) {
    const locale = pageLocale();
    throw new Error(toolLoadError(translator(locale), locale, result, tool));
  }
}
