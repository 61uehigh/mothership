"use client";

import { BarChart3, Bug, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, Settings } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { MiniPlayer } from "@/features/youtube-music/ui/MiniPlayer";
import { formatBinding } from "@/shell/commands/keys";
import { openQuestionsOldestFirst } from "@/shell/questions";
import { useShell } from "@/shell/shellContext";
import { startUsageTracking } from "@/shell/usage";
import { useSidebarWidths, useWorkbench } from "@/shell/workbenchContext";
import { useT } from "@/ui/i18n/useT";
import { ICON_BUTTON_BASE } from "@/ui/iconButtons";
import { tabEntry } from "@/workbench/registry";
import { EdgeDropZone } from "@/workbench/sectionDrag";
import { SectionStack } from "@/workbench/SectionStack";
import { SidebarResizer } from "@/workbench/SidebarResizer";
import { StatusBar } from "@/workbench/StatusBar";
import { TabErrorBoundary } from "@/workbench/TabErrorBoundary";
import { TAB_PANEL_ID, TabStrip, tabButtonId } from "@/workbench/TabStrip";
import { useWorkbenchCommands } from "@/workbench/useWorkbenchCommands";

const ICON_BUTTON = `${ICON_BUTTON_BASE} p-1.5`;

const LEFT_SIDEBAR_ID = "workbench-left";
const RIGHT_SIDEBAR_ID = "workbench-right";

/**
 * ### Workbench
 *
 * The frame: title bar with the command center and settings, every section
 * stacked in the two sidebars (development work on the left, work tools on
 * the right), and tabs in the center for whatever is picked from them. A
 * tab's details, such as a session's branch and merge actions, sit in a
 * column beside it.
 *
 * @param setupNeeded - From the app's one `/api/settings` load; `true` on a
 *   fresh install opens Settings with its welcome note, once per load.
 */
export function Workbench({ setupNeeded }: { setupNeeded: boolean | undefined }) {
  const workbench = useWorkbench();
  const { agents, questions, openPalette, notifications, developerMode } = useShell();
  const t = useT();
  const ctx = { agents, t };
  const active = workbench.active;
  const side = active === undefined ? undefined : tabEntry(active.tab).side?.(active.tab, ctx);
  const waiting = openQuestionsOldestFirst(questions);

  useWorkbenchCommands();
  // The effects below read the latest workbench through this ref so they run once.
  const latest = useRef(workbench);
  useEffect(() => {
    latest.current = workbench;
  });
  // Your own use of the app, for Insights; recorded on this computer only.
  useEffect(() => startUsageTracking(), []);

  // Settings reloads after every change; only the first answer may open it.
  const welcomed = useRef(false);
  useEffect(() => {
    if (setupNeeded === undefined || welcomed.current) return;
    welcomed.current = true;
    if (setupNeeded) latest.current.open({ kind: "settings" });
  }, [setupNeeded]);

  return (
    <div className="flex h-dvh flex-col overflow-clip bg-zinc-50 text-zinc-900 dark:bg-[#0c0c0e] dark:text-zinc-100">
      {/* In the Mac desktop app this is the window's title bar: it drags the window, and the
          window's close, minimize, and zoom buttons sit over its left end, which is kept empty
          only there (see TRAFFIC_LIGHTS_ATTRIBUTE). Browsers ignore app-region. */}
      <header
        data-usage-area="titlebar"
        className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-100/80 px-3 select-none [-webkit-app-region:drag] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <span aria-hidden className="hidden w-40 shrink-0 md:[[data-traffic-lights]_&]:block" />
        <button
          type="button"
          onClick={() => openPalette("everything")}
          className="mx-auto flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 text-xs text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 [-webkit-app-region:no-drag]"
        >
          <Search size={13} aria-hidden />
          <span className="truncate">{t("titleBar.search")}</span>
          <kbd className="ml-auto font-mono max-sm:hidden">{formatBinding("mod+p")}</kbd>
        </button>
        <span className="flex w-40 shrink-0 justify-end gap-0.5 [-webkit-app-region:no-drag] max-md:w-auto">
          {/* Brings a folded sidebar back, as in VS Code. Phones show only the left one, which opens over the center. */}
          {workbench.sidebars.left.length > 0 && (
            <button
              type="button"
              aria-label={workbench.leftOpen ? t("titleBar.hideLeft") : t("titleBar.showLeft")}
              aria-controls={LEFT_SIDEBAR_ID}
              aria-expanded={workbench.leftOpen}
              title={t("titleBar.withKeys", { label: workbench.leftOpen ? t("titleBar.hideLeft") : t("titleBar.showLeft"), keys: formatBinding("mod+b") })}
              className={ICON_BUTTON}
              onClick={workbench.toggleLeft}
            >
              {workbench.leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          )}
          {workbench.sidebars.right.length > 0 && (
            <button
              type="button"
              aria-label={workbench.rightOpen ? t("titleBar.hideRight") : t("titleBar.showRight")}
              aria-controls={RIGHT_SIDEBAR_ID}
              aria-expanded={workbench.rightOpen}
              title={t("titleBar.withKeys", { label: workbench.rightOpen ? t("titleBar.hideRight") : t("titleBar.showRight"), keys: formatBinding("mod+alt+b") })}
              className={`${ICON_BUTTON} max-md:hidden`}
              onClick={workbench.toggleRight}
            >
              {workbench.rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
          )}
          {developerMode && (
            <button type="button" aria-label={t("titleBar.debug")} title={t("titleBar.debugTitle", { keys: formatBinding("mod+alt+f") })} className={ICON_BUTTON} onClick={() => workbench.open({ kind: "debug" })}>
              <Bug size={15} />
            </button>
          )}
          <button type="button" aria-label={t("titleBar.insights")} title={t("titleBar.insights")} className={ICON_BUTTON} onClick={() => workbench.open({ kind: "insights" })}>
            <BarChart3 size={15} />
          </button>
          <button
            type="button"
            aria-label={t("titleBar.settings")}
            title={t("titleBar.withKeys", { label: t("titleBar.settings"), keys: formatBinding("mod+,") })}
            className={ICON_BUTTON}
            onClick={() => workbench.open({ kind: "settings" })}
          >
            <Settings size={15} />
          </button>
        </span>
      </header>

      {waiting.length > 0 && active?.tab.kind !== "inbox" && (
        <button
          type="button"
          onClick={() => workbench.open({ kind: "inbox", questionId: waiting[0].id })}
          className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-left text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-950"
        >
          <span className="shrink-0 font-semibold">
            {(() => {
              const name = agents.find((a) => a.id === waiting[0].agentId)?.name ?? t("titleBar.agent");
              return waiting.length > 1 ? t("titleBar.andMore", { name, count: waiting.length - 1 }) : t("titleBar.askedBy", { name });
            })()}
          </span>
          <span className="min-w-0 flex-1 truncate">{waiting[0].question}</span>
          <span className="shrink-0 text-xs">{t("titleBar.answer", { keys: formatBinding("n") })}</span>
        </button>
      )}

      <div className="relative flex min-h-0 flex-1">
        <EdgeDropZone side="left" />
        <EdgeDropZone side="right" />
        {workbench.leftOpen && workbench.sidebars.left.length > 0 && (
          <>
            <Sidebar
              side="left"
              id={LEFT_SIDEBAR_ID}
              className="flex min-h-0 shrink-0 flex-col border-r border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-950/60 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:bg-zinc-50 max-md:shadow-xl max-md:dark:bg-zinc-950"
            >
              <SectionStack side="left" sections={workbench.sidebars.left} />
            </Sidebar>
            <SidebarResizer side="left" controls={LEFT_SIDEBAR_ID} />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <TabStrip hasDetails={side !== undefined} />
          {active === undefined ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
              <p>{t("workbench.empty")}</p>
              <p>{t("workbench.emptyKeys", { open: formatBinding("mod+p"), session: formatBinding("c") })}</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <div
                role="tabpanel"
                id={TAB_PANEL_ID}
                aria-labelledby={tabButtonId(active.key)}
                data-usage-area={`tab:${active.tab.kind === "section" ? `section:${active.tab.section}` : active.tab.kind}`}
                className="flex min-w-0 flex-1 flex-col"
              >
                <TabErrorBoundary resetKey={active.key} onClose={() => workbench.close(active.key)}>
                  {tabEntry(active.tab).render(active.tab, ctx)}
                </TabErrorBoundary>
              </div>
              {side !== undefined && workbench.detailsOpen && (
                <div data-usage-area={`details:${active.tab.kind}`} className="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 max-lg:hidden">
                  <TabErrorBoundary resetKey={active.key} onClose={() => workbench.close(active.key)}>
                    {side}
                  </TabErrorBoundary>
                </div>
              )}
            </div>
          )}
        </main>

        {workbench.rightOpen && workbench.sidebars.right.length > 0 && (
          <>
            <SidebarResizer side="right" controls={RIGHT_SIDEBAR_ID} />
            <Sidebar
              side="right"
              id={RIGHT_SIDEBAR_ID}
              className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-950/60 max-md:hidden"
            >
              <SectionStack side="right" sections={workbench.sidebars.right} />
            </Sidebar>
          </>
        )}
      </div>

      <StatusBar notifications={notifications.state} onToggleNotifications={notifications.toggle} />
      <MiniPlayer />
    </div>
  );
}

/**
 * A sidebar sized from its own context: a resize drag re-renders this box
 * alone, and React skips its unchanged `children`.
 */
function Sidebar({ side, id, className, children }: { side: "left" | "right"; id: string; className: string; children: ReactNode }) {
  const widths = useSidebarWidths();
  const t = useT();
  return (
    <aside id={id} aria-label={side === "left" ? t("sidebar.left") : t("sidebar.right")} style={{ width: widths[side] }} className={className}>
      {children}
    </aside>
  );
}
