"use client";

import { BarChart3, Bug, PanelLeft, Search, Settings } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { SettingsView } from "@/features/settings/model/Settings";
import { MiniPlayer } from "@/features/youtube-music/ui/MiniPlayer";
import { formatBinding } from "@/shell/commands/keys";
import { useShell } from "@/shell/ShellContext";
import { startUsageTracking } from "@/shell/usage";
import { useSidebarWidths, useWorkbench } from "@/shell/WorkbenchContext";
import { ICON_BUTTON_BASE } from "@/ui/IconButton";
import { fetchJson } from "@/ui/useJson";
import { tabEntry } from "@/workbench/registry";
import { EdgeDropZone } from "@/workbench/SectionDrag";
import { SectionStack } from "@/workbench/SectionStack";
import { SidebarResizer } from "@/workbench/SidebarResizer";
import { StatusBar } from "@/workbench/StatusBar";
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
 */
export function Workbench() {
  const workbench = useWorkbench();
  const { agents, questions, openPalette, notifications, developerMode } = useShell();
  const ctx = { agents };
  const active = workbench.active;
  const side = active === undefined ? undefined : tabEntry(active.tab).side?.(active.tab, ctx);
  const waiting = questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt - b.createdAt);

  useWorkbenchCommands();
  // The effects below read the latest workbench through this ref so they run once.
  const latest = useRef(workbench);
  useEffect(() => {
    latest.current = workbench;
  });
  // Your own use of the app, for Insights; recorded on this Mac only.
  useEffect(() => startUsageTracking(), []);

  // A fresh install opens Settings with its welcome note once per load, until setup is finished.
  useEffect(() => {
    let cancelled = false;
    void fetchJson<SettingsView>("/api/settings").then((result) => {
      if (!cancelled && result.ok && result.data.setupNeeded) latest.current.open({ kind: "settings" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-[#0c0c0e] dark:text-zinc-100">
      {/* In the desktop app this is the window's title bar: it drags the window, and its
          empty left end holds the close, minimize, and zoom buttons. Browsers ignore app-region. */}
      <header
        data-usage-area="titlebar"
        className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-100/80 px-3 select-none [-webkit-app-region:drag] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <span aria-hidden className="w-40 shrink-0 max-md:hidden" />
        <button
          type="button"
          onClick={() => openPalette("everything")}
          className="mx-auto flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 text-xs text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 [-webkit-app-region:no-drag]"
        >
          <Search size={13} aria-hidden />
          <span className="truncate">Search sessions, files, docs, issues</span>
          <kbd className="ml-auto font-mono max-sm:hidden">{formatBinding("mod+p")}</kbd>
        </button>
        <span className="flex w-40 shrink-0 justify-end gap-0.5 [-webkit-app-region:no-drag] max-md:w-auto">
          {/* Phones have no room for both sidebars side by side; the left one opens over the center. */}
          <button type="button" aria-label="Toggle sections" title={`Toggle sections (${formatBinding("mod+b")})`} className={`${ICON_BUTTON} md:hidden`} onClick={workbench.toggleLeft}>
            <PanelLeft size={15} />
          </button>
          {developerMode && (
            <button type="button" aria-label="Debug" title={`Debug · feedback with ${formatBinding("mod+alt+f")}`} className={ICON_BUTTON} onClick={() => workbench.open({ kind: "debug" })}>
              <Bug size={15} />
            </button>
          )}
          <button type="button" aria-label="Insights" title="Insights" className={ICON_BUTTON} onClick={() => workbench.open({ kind: "insights" })}>
            <BarChart3 size={15} />
          </button>
          <button
            type="button"
            aria-label="Settings"
            title={`Settings (${formatBinding("mod+,")})`}
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
            {agents.find((a) => a.id === waiting[0].agentId)?.name ?? "Agent"}
            {waiting.length > 1 ? ` and ${waiting.length - 1} more` : ""}:
          </span>
          <span className="min-w-0 flex-1 truncate">{waiting[0].question}</span>
          <span className="shrink-0 text-xs">Answer {formatBinding("n")}</span>
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
              <p>Pick anything on either side to see it here.</p>
              <p>
                {formatBinding("mod+p")} to open anything · {formatBinding("c")} for a new session
              </p>
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
                {tabEntry(active.tab).render(active.tab, ctx)}
              </div>
              {side !== undefined && workbench.detailsOpen && (
                <div data-usage-area={`details:${active.tab.kind}`} className="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 max-lg:hidden">
                  {side}
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
  return (
    <aside id={id} aria-label={side === "left" ? "Left sidebar" : "Right sidebar"} style={{ width: widths[side] }} className={className}>
      {children}
    </aside>
  );
}
