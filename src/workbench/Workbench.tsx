"use client";

import { PanelLeft, PanelRightClose, PanelRightOpen, Search, Settings, X } from "lucide-react";
import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useShell } from "@/shell/ShellContext";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import { formatBinding } from "@/shell/commands/keys";
import { openPathIn } from "@/features/explorer/ui/openPath";
import { openIn } from "@/features/sessions/ui/openIn";
import { fetchJson } from "@/ui/useJson";
import { StatusBar } from "@/workbench/StatusBar";
import { tabEntry } from "@/workbench/registry";
import { SectionStack } from "@/workbench/SectionStack";
import type { SettingsView } from "@/features/settings/model/Settings";
import { ICON_BUTTON_BASE } from "@/ui/IconButton";
import { MothershipIcon } from "@/ui/MothershipIcon";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useWorkbench } from "@/shell/WorkbenchContext";

const ICON_BUTTON = `${ICON_BUTTON_BASE} p-1.5`;
/** Pixels an arrow key resizes a sidebar by; Shift makes it bigger. */
const RESIZE_STEP = 16;
const RESIZE_STEP_LARGE = 64;

function Resizer({ side, controls }: { side: "left" | "right"; /** Id of the sidebar it resizes. */ controls: string }) {
  const workbench = useWorkbench();
  const start = useRef<{ x: number; width: number } | undefined>(undefined);
  const width = side === "left" ? workbench.leftWidth : workbench.rightWidth;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    start.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (start.current === undefined) return;
    const delta = event.clientX - start.current.x;
    workbench.setWidth(side, start.current.width + (side === "left" ? delta : -delta));
  }
  // Ends a drag however it ends, so a cancelled pointer (e.g. the window losing focus) never leaves it stuck.
  const endDrag = () => {
    start.current = undefined;
  };
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    // Arrows move the edge; on the right sidebar the edge is on its left, so left widens it.
    const grow = side === "left" ? 1 : -1;
    const next: Record<string, number> = {
      ArrowLeft: width - step * grow,
      ArrowRight: width + step * grow,
      Home: SIDEBAR_MIN_WIDTH,
      End: SIDEBAR_MAX_WIDTH,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    workbench.setWidth(side, next[event.key]);
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={side === "left" ? "Resize left sidebar" : "Resize right sidebar"}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      className="w-1 shrink-0 cursor-col-resize bg-transparent outline-none hover:bg-teal-500/40 focus-visible:bg-teal-500/70 max-md:hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}

/** DOM id of the tab button for `key`, for `aria-labelledby` on its panel. */
const tabId = (key: string) => `workbench-tab-${encodeURIComponent(key)}`;
const TAB_PANEL_ID = "workbench-tab-panel";
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
  const { agents, questions, openPalette, notifications } = useShell();
  const ctx = { agents };
  const active = workbench.active;
  const side = active === undefined ? undefined : tabEntry(active.tab).side?.(active.tab, ctx);
  const waiting = questions.filter((q) => q.status === "open").sort((a, b) => a.createdAt - b.createdAt);

  // Commands read the latest workbench through this ref so they register once.
  const latest = useRef(workbench);
  useEffect(() => {
    latest.current = workbench;
  });
  const commands = useMemo<Array<Command>>(
    () => [
      { id: "toggle-left", title: "Toggle left sidebar", group: "View", keys: ["mod+b"], run: () => latest.current.toggleLeft() },
      { id: "toggle-right", title: "Toggle right sidebar", group: "View", keys: ["mod+alt+b"], run: () => latest.current.toggleRight() },
      {
        id: "close-tab",
        title: "Close tab",
        group: "View",
        keys: ["alt+w"],
        run: () => {
          const key = latest.current.active?.key;
          if (key !== undefined) latest.current.close(key);
        },
      },
      { id: "next-tab", title: "Next tab", group: "View", keys: ["alt+]"], run: () => latest.current.cycle(1) },
      { id: "prev-tab", title: "Previous tab", group: "View", keys: ["alt+["], run: () => latest.current.cycle(-1) },
      { id: "show-sessions", title: "Show sessions", group: "View", keys: ["g s"], run: () => latest.current.revealSection("sessions") },
      {
        id: "open-explorer",
        title: "Open Explorer",
        group: "View",
        keys: ["g e"],
        featured: true,
        run: () => latest.current.open({ kind: "section", section: "files" }),
      },
      {
        id: "open-terminal",
        title: "Open Terminal",
        group: "View",
        keys: ["g t"],
        featured: true,
        // In the folder of what you're looking at: the session's worktree, the file's folder, else the workspace.
        run: () => {
          const tab = latest.current.active?.tab;
          if (tab?.kind === "session" || tab?.kind === "changes") openIn(tab.agentId, "terminal");
          else if (tab?.kind === "file") openPathIn(tab.root, tab.path, "terminal");
          else openPathIn("workspace", "", "terminal");
        },
      },
      { id: "show-github", title: "Show GitHub", group: "View", keys: ["g g"], run: () => latest.current.revealSection("github") },
      {
        id: "open-settings",
        title: "Open Settings",
        group: "View",
        keys: ["mod+,"],
        featured: true,
        run: () => latest.current.open({ kind: "settings" }),
      },
    ],
    [],
  );
  useCommands(commands);

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

  const tabButtons = useRef(new Map<string, HTMLButtonElement>());
  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const { tabs } = workbench;
    if (event.key === "Delete") {
      event.preventDefault();
      workbench.close(tabs[index].key);
      return;
    }
    const targets: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = tabs[(targets[event.key] + tabs.length) % tabs.length];
    // Selection follows focus, as in an editor's tab strip.
    workbench.focus(next.key);
    tabButtons.current.get(next.key)?.focus();
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-[#0c0c0e] dark:text-zinc-100">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-100/80 px-3 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="flex w-40 shrink-0 items-center gap-1.5 text-sm font-semibold tracking-wide max-md:w-auto">
          <MothershipIcon size={18} className="shrink-0 text-teal-500" />
          <span className="truncate">mothership</span>
        </span>
        <button
          type="button"
          onClick={() => openPalette("everything")}
          className="mx-auto flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 text-xs text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <Search size={13} aria-hidden />
          <span className="truncate">Search sessions, files, docs, issues</span>
          <kbd className="ml-auto font-mono max-sm:hidden">{formatBinding("mod+p")}</kbd>
        </button>
        <span className="flex w-40 shrink-0 justify-end gap-0.5 max-md:w-auto">
          {/* Phones have no room for both sidebars side by side; the left one opens over the center. */}
          <button type="button" aria-label="Toggle sections" title={`Toggle sections (${formatBinding("mod+b")})`} className={`${ICON_BUTTON} md:hidden`} onClick={workbench.toggleLeft}>
            <PanelLeft size={15} />
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
        {workbench.leftOpen && workbench.sidebars.left.length > 0 && (
          <>
            <aside
              id={LEFT_SIDEBAR_ID}
              aria-label="Left sidebar"
              style={{ width: workbench.leftWidth }}
              className="flex min-h-0 shrink-0 flex-col border-r border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-950/60 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:bg-zinc-50 max-md:shadow-xl max-md:dark:bg-zinc-950"
            >
              <SectionStack sections={workbench.sidebars.left} />
            </aside>
            <Resizer side="left" controls={LEFT_SIDEBAR_ID} />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className={`${workbench.tabs.length === 0 ? "hidden" : "flex"} h-9 shrink-0 border-b border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-950/60`}>
            <div role="tablist" aria-label="Open tabs" className="flex min-w-0 flex-1 overflow-x-auto">
              {workbench.tabs.map((open, index) => {
                const entry = tabEntry(open.tab);
                const Icon = entry.icon;
                const selected = open.key === active?.key;
                const title = entry.title(open.tab, ctx);
                return (
                  <div
                    key={open.key}
                    role="presentation"
                    onAuxClick={(e) => {
                      if (e.button === 1) workbench.close(open.key);
                    }}
                    className={`group flex max-w-56 shrink-0 items-center pr-3 border-r border-zinc-200 text-xs dark:border-zinc-800 ${
                      selected
                        ? "border-t-2 border-t-teal-500 bg-zinc-50 text-zinc-900 dark:bg-[#0c0c0e] dark:text-zinc-100"
                        : "border-t-2 border-t-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <button
                      ref={(element) => {
                        if (element === null) tabButtons.current.delete(open.key);
                        else tabButtons.current.set(open.key, element);
                      }}
                      type="button"
                      role="tab"
                      id={tabId(open.key)}
                      aria-selected={selected}
                      aria-controls={selected ? TAB_PANEL_ID : undefined}
                      // One tab stop for the strip: the active tab; arrow keys move between tabs.
                      tabIndex={selected || (active === undefined && index === 0) ? 0 : -1}
                      onClick={() => workbench.focus(open.key)}
                      onDoubleClick={() => workbench.pin(open.key)}
                      onKeyDown={(e) => onTabKeyDown(e, index)}
                      className="flex min-w-0 cursor-pointer items-center gap-1.5 self-stretch pl-3 pr-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
                    >
                      <Icon size={13} aria-hidden className="shrink-0" />
                      <span className={`truncate ${open.preview ? "italic" : ""}`}>{title}</span>
                    </button>
                    <button
                      type="button"
                      // Delete on the focused tab closes it from the keyboard; this is the mouse target.
                      tabIndex={-1}
                      aria-label={`Close ${title}`}
                      title={`Close (${formatBinding("alt+w")})`}
                      className={`rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`}
                      onClick={() => workbench.close(open.key)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            {side !== undefined && (
              <button
                type="button"
                aria-label={workbench.detailsOpen ? "Hide details" : "Show details"}
                aria-expanded={workbench.detailsOpen}
                title={workbench.detailsOpen ? "Hide details" : "Show details"}
                className="flex shrink-0 items-center gap-1 border-l border-zinc-200 bg-zinc-100 px-2.5 text-xs text-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:text-zinc-100 max-lg:hidden"
                onClick={workbench.toggleDetails}
              >
                {workbench.detailsOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                Details
              </button>
            )}
          </div>
          {active === undefined ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
              <p>Pick anything on either side to see it here.</p>
              <p>
                {formatBinding("mod+p")} to open anything · {formatBinding("c")} for a new session
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabId(active.key)} className="flex min-w-0 flex-1 flex-col">
                {tabEntry(active.tab).render(active.tab, ctx)}
              </div>
              {side !== undefined && workbench.detailsOpen && (
                <div className="w-72 shrink-0 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 max-lg:hidden">{side}</div>
              )}
            </div>
          )}
        </main>

        {workbench.rightOpen && workbench.sidebars.right.length > 0 && (
          <>
            <Resizer side="right" controls={RIGHT_SIDEBAR_ID} />
            <aside
              id={RIGHT_SIDEBAR_ID}
              aria-label="Right sidebar"
              style={{ width: workbench.rightWidth }}
              className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-950/60 max-md:hidden"
            >
              <SectionStack sections={workbench.sidebars.right} />
            </aside>
          </>
        )}
      </div>

      <StatusBar notifications={notifications.state} onToggleNotifications={notifications.toggle} />
    </div>
  );
}
