"use client";

import { memo, useMemo, type DragEvent, type ReactNode } from "react";
import { SECTION_ENTRIES } from "@/workbench/registry";
import { useSectionDrag } from "@/workbench/SectionDrag";
import { StackedSectionContext } from "@/shell/PaneHeader";
import type { SectionId } from "@/shell/tabs";
import { useWorkbench, useWorkbenchActions } from "@/shell/WorkbenchContext";

/** The line drawn where a dragged section would land. */
function InsertionLine({ at }: { at: "top" | "bottom" }) {
  return <div aria-hidden className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-teal-500 ${at === "top" ? "top-0" : "bottom-0"}`} />;
}

/** One section's stacked context, stable while it stays folded or unfolded, so its pane does not re-render with the stack. */
function StackedSectionProvider({ section, collapsed, children }: { section: SectionId; collapsed: boolean; children: ReactNode }) {
  const { toggleSection, open, placeSection } = useWorkbenchActions();
  const value = useMemo(
    () => ({
      section,
      collapsed,
      toggle: () => toggleSection(section),
      openFull: () => open({ kind: "section", section }),
      hide: () => placeSection(section, "hidden"),
      icon: SECTION_ENTRIES[section].icon,
    }),
    [section, collapsed, toggleSection, open, placeSection],
  );
  return <StackedSectionContext.Provider value={value}>{children}</StackedSectionContext.Provider>;
}

/** A section's pane; memoised so a drag over the stack or a tab change does not re-render every pane. */
const SectionPane = memo(function SectionPane({ section }: { section: SectionId }) {
  return SECTION_ENTRIES[section].pane();
});

/**
 * ### SectionStack
 *
 * Several sections stacked in one sidebar, like VS Code's Explorer views.
 * Unfolded sections share the height evenly; folded ones keep only their
 * header. A section's title folds it; its expand button opens it full size
 * in the center. Dragging a header moves the section within this sidebar or
 * to the other one.
 */
export function SectionStack({ side, sections }: { side: "left" | "right"; sections: Array<SectionId> }) {
  const workbench = useWorkbench();
  const drag = useSectionDrag();
  // Dropping a section right above or below itself changes nothing, so no line there.
  const from = drag.dragged === undefined ? -1 : sections.indexOf(drag.dragged);
  const index = drag.target?.side === side ? drag.target.index : undefined;
  const lineAt = index === undefined || (from !== -1 && (index === from || index === from + 1)) ? undefined : index;
  // Above the middle of a section lands before it, below lands after it.
  const indexAt = (event: DragEvent<HTMLElement>, i: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? i : i + 1;
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      // Below every section (when they are all folded) lands at the end.
      onDragOver={(e) => drag.over(e, side, sections.length)}
      onDrop={(e) => drag.drop(e, side, sections.length)}
    >
      {sections.map((section, i) => {
        const collapsed = workbench.collapsed.includes(section);
        return (
          <StackedSectionProvider key={section} section={section} collapsed={collapsed}>
            <div
              data-section={section}
              data-usage-area={`sidebar:${section}`}
              onDragOver={(e) => drag.over(e, side, indexAt(e, i))}
              onDrop={(e) => drag.drop(e, side, indexAt(e, i))}
              className={`relative border-t border-zinc-200 first:border-t-0 dark:border-zinc-800 ${
                collapsed ? "box-content flex h-9 shrink-0 flex-col overflow-hidden" : "flex min-h-28 flex-1 basis-0 flex-col overflow-hidden"
              } ${drag.dragged === section ? "opacity-50" : ""}`}
            >
              {lineAt === i && <InsertionLine at="top" />}
              {lineAt === sections.length && i === sections.length - 1 && <InsertionLine at="bottom" />}
              <SectionPane section={section} />
            </div>
          </StackedSectionProvider>
        );
      })}
    </div>
  );
}
