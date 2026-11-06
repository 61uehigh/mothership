"use client";

import { PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatBinding } from "@/shell/commands/keys";
import { useShell } from "@/shell/ShellContext";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { tabEntry } from "@/workbench/registry";

/**
 * ### TAB_PANEL_ID
 *
 * DOM id of the panel showing the active tab, which its tab button controls.
 */
export const TAB_PANEL_ID = "workbench-tab-panel";

/**
 * ### tabButtonId
 *
 * DOM id of the tab button for `key`, for `aria-labelledby` on its panel.
 */
export const tabButtonId = (key: string) => `workbench-tab-${encodeURIComponent(key)}`;

/**
 * ### TabStrip
 *
 * The open tabs, as an editor's tab strip: arrow keys move between them,
 * Delete closes one, double-click pins a preview. With `hasDetails`, a button
 * at its right end shows or hides the active tab's details column.
 */
export function TabStrip({ hasDetails }: { hasDetails: boolean }) {
  const workbench = useWorkbench();
  const { agents } = useShell();
  const ctx = { agents };
  const active = workbench.active;
  const tabButtons = useRef(new Map<string, HTMLButtonElement>());
  // Set when Delete closes the focused tab: its button is gone, so focus moves to the tab that takes its place.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (active !== undefined) tabButtons.current.get(active.key)?.focus();
  }, [active]);
  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const { tabs } = workbench;
    if (event.key === "Delete") {
      event.preventDefault();
      const closing = tabs[index].key;
      if (closing === active?.key) refocus.current = true;
      // Closing a tab that is not the active one keeps the active tab, so focus goes to a neighbour now.
      else tabButtons.current.get((tabs[index + 1] ?? tabs[index - 1])?.key ?? "")?.focus();
      workbench.close(closing);
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
    <div
      className={`${workbench.tabs.length === 0 ? "hidden" : "flex"} h-9 shrink-0 bg-zinc-100/60 shadow-[inset_0_-1px_0_var(--color-zinc-200)] dark:bg-zinc-950/60 dark:shadow-[inset_0_-1px_0_var(--color-zinc-800)]`}
    >
      <div role="tablist" aria-label="Open tabs" data-usage-area="tabs" className="flex min-w-0 flex-1 overflow-x-auto">
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
              className={`group flex max-w-56 shrink-0 items-center border-r border-r-zinc-200 pr-3 pb-px text-xs dark:border-r-zinc-800 ${
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
                id={tabButtonId(open.key)}
                aria-selected={selected}
                aria-controls={selected ? TAB_PANEL_ID : undefined}
                // One tab stop for the strip: the active tab; arrow keys move between tabs.
                tabIndex={selected || (active === undefined && index === 0) ? 0 : -1}
                onClick={() => workbench.focus(open.key)}
                onDoubleClick={() => workbench.pin(open.key)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                className="flex min-w-0 cursor-pointer items-center gap-1.5 self-stretch pl-3 pr-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
              >
                <Icon size={14} aria-hidden className="shrink-0" />
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
      {hasDetails && (
        <button
          type="button"
          aria-label={workbench.detailsOpen ? "Hide details" : "Show details"}
          aria-expanded={workbench.detailsOpen}
          title={workbench.detailsOpen ? "Hide details" : "Show details"}
          className="flex shrink-0 items-center gap-1 border-l border-zinc-200 bg-zinc-100 shadow-[inset_0_-1px_0_var(--color-zinc-200)] dark:shadow-[inset_0_-1px_0_var(--color-zinc-800)] px-2.5 text-xs text-zinc-500 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:text-zinc-100 max-lg:hidden"
          onClick={workbench.toggleDetails}
        >
          {workbench.detailsOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          Details
        </button>
      )}
    </div>
  );
}
