"use client";

import { ChevronRight, EyeOff, GripVertical, Maximize2 } from "lucide-react";
import { createContext, useContext, useRef, type ComponentType, type ReactNode } from "react";
import { SECTION_DRAG_TYPE } from "@/shell/sections";
import type { SectionId } from "@/shell/tabs";
import type { BrandIconProps } from "@/ui/brandIcons";

/**
 * ### StackedSection
 *
 * Set by `SectionStack` when a pane is shown as one of several stacked
 * sections, so its header can fold it, open it full size, hide it, and be
 * dragged to another place in the sidebars.
 */
export type StackedSection = {
  section: SectionId;
  collapsed: boolean;
  toggle: () => void;
  openFull: () => void;
  /** Takes the section out of the sidebars (Settings → Workspace → Sidebars brings it back). */
  hide: () => void;
  icon: ComponentType<BrandIconProps>;
};

/**
 * ### StackedSectionContext
 *
 * `undefined` when the pane fills a sidebar or a tab on its own.
 */
export const StackedSectionContext = createContext<StackedSection | undefined>(undefined);

/**
 * ### PaneHeader
 *
 * Title row of a sidebar pane, with optional icon buttons on the right.
 * Shared so every section (sessions, explorer, GitHub, tools) lines up. When
 * the pane is stacked in a sidebar, the row folds the section and offers to open
 * it full size in the center.
 */
export function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  const stacked = useContext(StackedSectionContext);
  // Whether the press that may start a drag began on one of the header's own buttons (refresh, expand, …).
  const pressedAction = useRef(false);

  if (stacked === undefined) {
    return (
      <header className="flex h-9 shrink-0 items-center gap-1 px-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {children}
      </header>
    );
  }

  // The whole row drags the section to another place in the sidebars; a press on the
  // header's own buttons stays a click. Never a window drag region in the desktop app.
  return (
    <header
      draggable
      onPointerDown={(event) => {
        pressedAction.current = event.target instanceof Element && event.target.closest("button:not([data-section-handle])") !== null;
      }}
      onDragStart={(event) => {
        if (pressedAction.current) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData(SECTION_DRAG_TYPE, stacked.section);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="group/section flex h-9 shrink-0 cursor-grab items-center gap-0.5 pl-1 pr-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500 select-none [-webkit-app-region:no-drag] active:cursor-grabbing"
    >
      <GripVertical size={11} aria-hidden className="shrink-0 text-zinc-400 opacity-0 group-hover/section:opacity-100" />
      <button
        type="button"
        data-section-handle
        aria-expanded={!stacked.collapsed}
        aria-keyshortcuts="Alt+Shift+ArrowUp Alt+Shift+ArrowDown Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
        title="Click to fold · drag to move"
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1 py-1 text-left hover:text-zinc-900 active:cursor-grabbing dark:hover:text-zinc-100"
        onClick={stacked.toggle}
      >
        <ChevronRight size={13} className={`shrink-0 transition-transform ${stacked.collapsed ? "" : "rotate-90"}`} aria-hidden />
        <stacked.icon size={14} className="shrink-0 text-zinc-600 dark:text-zinc-300" aria-hidden />
        <span className="truncate">{title}</span>
      </button>
      {!stacked.collapsed && children}
      <button
        type="button"
        aria-label={`Open ${title} full size`}
        title="Open full size"
        className="rounded p-1 opacity-0 hover:bg-zinc-200 focus-visible:opacity-100 group-hover/section:opacity-100 dark:hover:bg-zinc-800"
        onClick={stacked.openFull}
      >
        <Maximize2 size={14} />
      </button>
      <button
        type="button"
        aria-label={`Hide ${title} from the sidebar`}
        title="Hide from the sidebar (bring it back in Settings → Workspace → Sidebars)"
        className="rounded p-1 opacity-0 hover:bg-zinc-200 focus-visible:opacity-100 group-hover/section:opacity-100 dark:hover:bg-zinc-800"
        onClick={stacked.hide}
      >
        <EyeOff size={14} />
      </button>
    </header>
  );
}
