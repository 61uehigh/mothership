"use client";

import { createContext, useContext, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { SECTION_DRAG_TYPE } from "@/shell/sections";
import { isSectionId, type SectionId } from "@/shell/tabs";
import { useWorkbench } from "@/shell/WorkbenchContext";

type Side = "left" | "right";

/** Where a dragged section would land: before the section at `index` in a sidebar (its length for the end). */
type DropTarget = { side: Side; index: number };

type SectionDrag = {
  /** The section being dragged, from a sidebar header or Settings → Sidebars; `undefined` when none is. */
  dragged: SectionId | undefined;
  target: DropTarget | undefined;
  /** Accepts a dragged section over this spot and remembers it as the target. */
  over: (event: DragEvent, side: Side, index: number) => void;
  /** Moves the dropped section to the spot. */
  drop: (event: DragEvent, side: Side, index: number) => void;
};

const SectionDragContext = createContext<SectionDrag | undefined>(undefined);


/**
 * ### SectionDragProvider
 *
 * Follows a section being dragged anywhere in the window (native drag and
 * drop), so the sidebars can draw where it would land and a closed or empty
 * sidebar can offer a drop zone at the window edge.
 */
export function SectionDragProvider({ children }: { children: ReactNode }) {
  const { placeSection } = useWorkbench();
  const [dragged, setDragged] = useState<SectionId | undefined>(undefined);
  const [target, setTarget] = useState<DropTarget | undefined>(undefined);

  useEffect(() => {
    // The data is only readable at the start and the drop, so remember which section it is.
    const start = (event: globalThis.DragEvent) => {
      const section = event.dataTransfer?.getData(SECTION_DRAG_TYPE);
      if (isSectionId(section)) setDragged(section);
    };
    const end = () => {
      setDragged(undefined);
      setTarget(undefined);
    };
    // Over anything that doesn't take a section (the center, the title bar), there is no target.
    const overElsewhere = (event: globalThis.DragEvent) => {
      if (!event.defaultPrevented) setTarget(undefined);
    };
    window.addEventListener("dragstart", start);
    // `dragend` goes to the dragged header, which is gone when it moved to the other sidebar; `drop` covers that.
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    window.addEventListener("dragover", overElsewhere);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
      window.removeEventListener("dragover", overElsewhere);
    };
  }, []);

  const value = useMemo<SectionDrag>(
    () => ({
      dragged,
      target,
      over: (event, side, index) => {
        if (!event.dataTransfer.types.includes(SECTION_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        // Fires many times a second; only a new spot re-renders.
        setTarget((current) => (current?.side === side && current.index === index ? current : { side, index }));
      },
      drop: (event, side, index) => {
        const section = event.dataTransfer.getData(SECTION_DRAG_TYPE);
        setDragged(undefined);
        setTarget(undefined);
        if (!isSectionId(section)) return;
        event.preventDefault();
        event.stopPropagation();
        placeSection(section, side, index);
      },
    }),
    [dragged, target, placeSection],
  );

  return <SectionDragContext.Provider value={value}>{children}</SectionDragContext.Provider>;
}

/**
 * ### useSectionDrag
 *
 * @returns The section being dragged, where it would land, and the drop handlers.
 */
export function useSectionDrag(): SectionDrag {
  const drag = useContext(SectionDragContext);
  if (drag === undefined) throw new Error("useSectionDrag must be used inside SectionDragProvider");
  return drag;
}

/**
 * ### EdgeDropZone
 *
 * While a section is dragged and the sidebar on `side` is closed or empty,
 * a strip along that window edge to drop it on; dropping opens the sidebar.
 */
export function EdgeDropZone({ side }: { side: Side }) {
  const workbench = useWorkbench();
  const drag = useSectionDrag();
  const shown = side === "left" ? workbench.leftOpen && workbench.sidebars.left.length > 0 : workbench.rightOpen && workbench.sidebars.right.length > 0;
  if (drag.dragged === undefined || shown) return null;
  const end = workbench.sidebars[side].length;
  const targeted = drag.target?.side === side;
  return (
    <div
      aria-hidden
      onDragOver={(e) => drag.over(e, side, end)}
      onDrop={(e) => drag.drop(e, side, end)}
      className={`absolute inset-y-2 z-30 flex w-14 items-center justify-center rounded-lg border-2 border-dashed text-[11px] font-medium text-teal-700 transition-colors [-webkit-app-region:no-drag] dark:text-teal-300 ${
        side === "left" ? "left-2" : "right-2"
      } ${targeted ? "border-teal-500 bg-teal-500/20" : "border-teal-500/50 bg-zinc-50/90 dark:bg-zinc-950/90"}`}
    >
      <span className="[writing-mode:vertical-rl]">{side === "left" ? "Left sidebar" : "Right sidebar"}</span>
    </div>
  );
}
