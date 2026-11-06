"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useSidebarWidths, useWorkbenchActions } from "@/shell/WorkbenchContext";

/** Pixels an arrow key resizes a sidebar by; Shift makes it bigger. */
const RESIZE_STEP = 16;
const RESIZE_STEP_LARGE = 64;
/** Dragging a sidebar's edge this far past its narrowest width folds the sidebar away, as in VS Code. */
const COLLAPSE_PAST_MIN = 90;

/**
 * ### SidebarResizer
 *
 * The draggable edge of a sidebar, also moved with the arrow keys. Dragging
 * well past the narrowest width folds the sidebar away.
 */
export function SidebarResizer({ side, controls }: { side: "left" | "right"; /** Id of the sidebar it resizes. */ controls: string }) {
  const workbench = useWorkbenchActions();
  const start = useRef<{ x: number; width: number } | undefined>(undefined);
  const width = useSidebarWidths()[side];

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    start.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (start.current === undefined) return;
    const delta = event.clientX - start.current.x;
    const next = start.current.width + (side === "left" ? delta : -delta);
    if (next < SIDEBAR_MIN_WIDTH - COLLAPSE_PAST_MIN) {
      // Keeps the width it had, so reopening it (⌘B, ⌘⌥B) brings it back the same size.
      workbench.setWidth(side, start.current.width);
      start.current = undefined;
      if (side === "left") workbench.toggleLeft();
      else workbench.toggleRight();
      return;
    }
    workbench.setWidth(side, next);
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
