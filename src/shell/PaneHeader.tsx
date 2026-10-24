"use client";

import { ChevronRight, Maximize2 } from "lucide-react";
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { BrandIconProps } from "@/ui/brandIcons";

/**
 * ### StackedSection
 *
 * Set by `SectionStack` when a pane is shown as one of several stacked
 * sections, so its header can fold it and open it full size.
 */
export type StackedSection = { collapsed: boolean; toggle: () => void; openFull: () => void; icon: ComponentType<BrandIconProps> };

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

  if (stacked === undefined) {
    return (
      <header className="flex h-9 shrink-0 items-center gap-1 px-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {children}
      </header>
    );
  }

  return (
    <header className="group/section flex h-8 shrink-0 items-center gap-1 pl-1 pr-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
      <button
        type="button"
        aria-expanded={!stacked.collapsed}
        className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left hover:text-zinc-900 dark:hover:text-zinc-100"
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
        <Maximize2 size={12} />
      </button>
    </header>
  );
}
