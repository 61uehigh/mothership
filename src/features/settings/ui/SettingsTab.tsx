"use client";

import { useEffect, useRef, useState } from "react";
import type { SettingsView } from "@/features/settings/model/Settings";
import { SETTINGS_PAGE_LIST } from "@/features/settings/ui/settingsPages";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { parseSettingsPage, SETTINGS_PAGE_KEY, settingsMenuPage, type SettingsDestination } from "@/shell/settingsPage";
import { fetchJson, jsonRequest, useJson } from "@/ui/useJson";
import { useStoredState } from "@/ui/useStoredState";
import { SELECTED_NAV, UNSELECTED_NAV } from "@/ui/selection";
import { Message } from "@/ui/Message";

/**
 * ### SettingsTab
 *
 * Settings as a full tab: a side menu of the pages in
 * {@link SETTINGS_PAGE_LIST}, a dot on those that need attention, and the
 * page last shown. A fresh install opens it with a welcome note.
 */
export function SettingsTab() {
  const fetched = useJson<SettingsView>("/api/settings", { remember: true });
  const [destination, setDestination] = useStoredState<SettingsDestination>(SETTINGS_PAGE_KEY, "agents", parseSettingsPage);
  const page = settingsMenuPage(destination);
  const [saved, setSaved] = useState<SettingsView | undefined>(undefined);
  const view = saved ?? fetched.data;

  async function send(url: string, method: string, body: unknown): Promise<string | undefined> {
    const result = await fetchJson<SettingsView>(url, jsonRequest(method, body));
    if (!result.ok) return result.error;
    setSaved(result.data);
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    return undefined;
  }
  const saveSecret = (name: string, value: string) => send("/api/settings/secrets", "PUT", { name, value });
  async function recheck() {
    const result = await fetchJson<SettingsView>("/api/settings");
    if (result.ok) setSaved(result.data);
  }

  // In a narrow tab the menu is one scrolling row; keep the open page in view there.
  const nav = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const loaded = view !== undefined;
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [page, loaded]);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [destination]);

  if (view === undefined) {
    return (
      <Message size="tab" tone={fetched.error === undefined ? "muted" : "error"} onRetry={fetched.error === undefined ? undefined : fetched.reload}>
        {fetched.error ?? "Checking your setup…"}
      </Message>
    );
  }
  const current = SETTINGS_PAGE_LIST.find((p) => p.id === page) ?? SETTINGS_PAGE_LIST[0];

  return (
    // Laid out by the tab's own width: a narrow center puts the menu in a row on top.
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 @max-2xl:flex-col">
        <nav
          ref={nav}
          aria-label="Settings"
          className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-zinc-200 p-2 dark:border-zinc-800 @max-2xl:w-auto @max-2xl:flex-row @max-2xl:overflow-x-auto @max-2xl:scroll-px-2 @max-2xl:border-r-0 @max-2xl:border-b"
        >
          <h1 className="px-2 pt-1 pb-2 text-sm font-semibold @max-2xl:hidden">Settings</h1>
          {SETTINGS_PAGE_LIST.map(({ id, label, icon: Icon, needsAttention }) => {
            const selected = id === current.id;
            return (
              <button
                key={id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => {
                  if (!selected) setDestination(id);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${selected ? SELECTED_NAV : UNSELECTED_NAV}`}
              >
                <Icon size={14} aria-hidden className="shrink-0" />
                <span className="flex-1 whitespace-nowrap">{label}</span>
                {needsAttention(view) && (
                  <>
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="sr-only">(needs attention)</span>
                  </>
                )}
              </button>
            );
          })}
        </nav>
        <div ref={content} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6 @max-md:px-4">
            {view.setupNeeded && (
              <div className="flex flex-col gap-2 rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm dark:border-teal-900 dark:bg-teal-950/40">
                <p className="font-medium">Welcome to mothership</p>
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Set up the parts you use; everything is optional except one way to run agents. Connect each work tool with a token, or use the claude.ai
                  connectors you already have. Items marked with a dot need attention. You can come back here any time from the gear at the top right.
                </p>
                <button
                  type="button"
                  className="self-start rounded-md bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500"
                  onClick={() => void send("/api/settings", "PATCH", { setupDone: true })}
                >
                  Finish setup
                </button>
              </div>
            )}
            {current.render({ view, send, saveSecret, recheck, destination, showPage: setDestination })}
          </div>
        </div>
      </div>
    </div>
  );
}
