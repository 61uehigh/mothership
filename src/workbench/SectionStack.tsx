"use client";

import { SECTION_ENTRIES } from "@/workbench/registry";
import { StackedSectionContext } from "@/shell/PaneHeader";
import type { SectionId } from "@/shell/tabs";
import { useWorkbench } from "@/shell/WorkbenchContext";

/**
 * ### SectionStack
 *
 * Several sections stacked in one sidebar, like VS Code's Explorer views.
 * Unfolded sections share the height evenly; folded ones keep only their
 * header. A section's title folds it; its expand button opens it full size
 * in the center.
 */
export function SectionStack({ sections }: { sections: Array<SectionId> }) {
  const workbench = useWorkbench();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sections.map((section) => {
        const collapsed = workbench.collapsed.includes(section);
        const pane = SECTION_ENTRIES[section].pane;
        return (
          <StackedSectionContext.Provider
            key={section}
            value={{
              collapsed,
              toggle: () => workbench.toggleSection(section),
              openFull: () => workbench.open({ kind: "section", section }),
              icon: SECTION_ENTRIES[section].icon,
            }}
          >
            <div
              className={`border-t border-zinc-200 first:border-t-0 dark:border-zinc-800 ${
                collapsed ? "flex h-8 shrink-0 flex-col overflow-hidden" : "flex min-h-28 flex-1 basis-0 flex-col overflow-hidden"
              }`}
            >
              {pane()}
            </div>
          </StackedSectionContext.Provider>
        );
      })}
    </div>
  );
}
