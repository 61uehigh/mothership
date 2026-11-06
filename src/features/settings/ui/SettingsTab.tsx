"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsView } from "@/features/settings/model/Settings";
import { DeveloperModeContext } from "@/features/settings/ui/developerMode";
import { SETTINGS_PAGE_LIST } from "@/features/settings/ui/settingsPages";
import { SaveStatus, SETTINGS_BUTTON, SETTINGS_PRIMARY_BUTTON, useSave } from "@/features/settings/ui/settingsLayout";
import { SETTINGS_CHANGED_EVENT } from "@/shell/events";
import { parseSettingsPage, SETTINGS_PAGE_KEY, settingsMenuPage, type SettingsDestination } from "@/shell/settingsPage";
import { fetchJson, jsonRequest, useJson } from "@/ui/useJson";
import { useStoredState } from "@/ui/useStoredState";
import { SELECTED_NAV, UNSELECTED_NAV } from "@/ui/selection";
import { Message } from "@/ui/Message";
import { useT } from "@/ui/i18n/useT";
import { nextSaved, shownView, type SavedView } from "@/features/settings/ui/saveAnswers";

/** A counter that only an event handler moves, so each call gets a larger number than the last. */
function useCounter(): () => number {
  const count = useRef(0);
  return useCallback(() => ++count.current, []);
}

/**
 * ### SettingsTab
 *
 * Settings as a full tab: a side menu of the pages in
 * {@link SETTINGS_PAGE_LIST}, a dot on those that need attention, and the
 * page last shown. A fresh install opens it with a welcome note.
 */
export function SettingsTab() {
  const t = useT();
  const fetched = useJson<SettingsView>("/api/settings", { remember: true });
  const [destination, setDestination] = useStoredState<SettingsDestination>(SETTINGS_PAGE_KEY, "agents", parseSettingsPage);
  const page = settingsMenuPage(destination);
  const [saved, setSaved] = useState<SavedView<SettingsView> | undefined>(undefined);
  const nextAsk = useCounter();
  const view = shownView(saved, fetched.data);
  function show(asked: number, answer: SettingsView | undefined, over: SettingsView | undefined) {
    setSaved((shown) => nextSaved(shown, asked, answer, over));
  }

  async function send(url: string, method: string, body: unknown): Promise<string | undefined> {
    const over = fetched.data;
    const asked = nextAsk();
    const result = await fetchJson<SettingsView>(url, jsonRequest(method, body));
    show(asked, result.ok ? result.data : undefined, over);
    if (!result.ok) return result.error;
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    return undefined;
  }
  const saveSecret = (name: string, value: string) => send("/api/settings/secrets", "PUT", { name, value });
  const hideWelcome = useSave(() => send("/api/settings", "PATCH", { setupDone: true }));
  async function recheck() {
    const over = fetched.data;
    const asked = nextAsk();
    const result = await fetchJson<SettingsView>("/api/settings");
    show(asked, result.ok ? result.data : undefined, over);
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
        {fetched.error ?? t("settings.checking")}
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
          aria-label={t("tab.settings")}
          className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-zinc-200 p-2 dark:border-zinc-800 @max-2xl:w-auto @max-2xl:flex-row @max-2xl:overflow-x-auto @max-2xl:scroll-px-2 @max-2xl:border-r-0 @max-2xl:border-b"
        >
          <p className="px-2 pt-1 pb-2 text-sm font-semibold @max-2xl:hidden">{t("tab.settings")}</p>
          {SETTINGS_PAGE_LIST.map(({ id, icon: Icon, needsAttention }) => {
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
                <span className="flex-1 whitespace-nowrap">{t(`settings.${id}`)}</span>
                {needsAttention(view) && (
                  <>
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="sr-only">{t("settings.needsAttention")}</span>
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
                <p className="font-medium">{t("settings.welcome.title")}</p>
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {t("settings.welcome.body")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {current.id !== "agents" && (
                    <button type="button" className={SETTINGS_PRIMARY_BUTTON} onClick={() => setDestination("agents")}>
                      {t("settings.welcome.goToAgents")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={current.id === "agents" ? SETTINGS_PRIMARY_BUTTON : SETTINGS_BUTTON}
                    disabled={hideWelcome.state.busy}
                    onClick={() => void hideWelcome.save()}
                  >
                    {t("settings.welcome.hide")}
                  </button>
                  <SaveStatus state={hideWelcome.state} />
                </div>
              </div>
            )}
            <h1 className="-mb-2 text-lg font-semibold">{t(`settings.${current.id}`)}</h1>
            <DeveloperModeContext.Provider value={view.developer.enabled}>
              {current.render({ view, send, saveSecret, recheck, destination, showPage: setDestination })}
            </DeveloperModeContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
