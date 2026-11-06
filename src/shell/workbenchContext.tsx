"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { dropSection, normalizeSidebars, sideOf, type SectionPlace, type Sidebars } from "@/shell/sections";
import { SECTIONS, type SectionId, type Tab } from "@/shell/tabs";
import { recordOpen } from "@/shell/usage";
import { DEFAULT_LAYOUT, restoredLayout, restoredTabs, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, tabsReducer, type Layout, type OpenTab } from "@/shell/workbenchState";

const STORAGE_KEY = "mothership.workbench";

/** `seenSections`: every section there was when saved, so sections added later can join the sidebars. */
type Saved = Layout & { tabs: Array<OpenTab>; activeKey: string | undefined; seenSections: ReadonlyArray<SectionId> };

/**
 * ### WorkbenchContextValue
 *
 * Shared state of the layout: open tabs, the active tab, folded sections,
 * and sidebar sizes. Persisted per browser.
 */
export type WorkbenchContextValue = Omit<Layout, "leftWidth" | "rightWidth"> & {
  tabs: Array<OpenTab>;
  active: OpenTab | undefined;
  /**
   * ### open
   *
   * Focuses the tab if it is already open, otherwise adds it. A `preview`
   * open replaces the current preview tab (single click in a list), like
   * VS Code; a pinned open keeps it.
   */
  open: (tab: Tab, options?: { preview?: boolean }) => void;
  /**
   * ### update
   *
   * Refreshes the fields of an open tab with the same key (a title that
   * changed, say) without focusing it; does nothing when it is not open.
   */
  update: (tab: Tab) => void;
  /** Pins the tab so later previews do not replace it. */
  pin: (key: string) => void;
  close: (key: string) => void;
  /** Closes several tabs at once (e.g. every tab of a deleted session). */
  closeMany: (keys: Array<string>) => void;
  focus: (key: string) => void;
  /** Moves focus to the next (`1`) or previous (`-1`) tab. */
  cycle: (delta: number) => void;
  /** Unfolds a section and opens the sidebar it lives in; one not in a sidebar opens full size. */
  revealSection: (section: SectionId) => void;
  /** Sets which sections each sidebar shows, in order. */
  setSidebars: (sidebars: Sidebars) => void;
  /**
   * ### placeSection
   *
   * Moves a section to just before the one now at `before` in `place` (the
   * end when left out), as dropping it there does, and opens that sidebar
   * if it was closed. The same layout Settings → Workspace → Sidebars edits.
   */
  placeSection: (section: SectionId, place: SectionPlace, before?: number) => void;
  /** Folds or unfolds a stacked section. */
  toggleSection: (section: SectionId) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleDetails: () => void;
  setWidth: (side: "left" | "right", width: number) => void;
};

/**
 * ### WorkbenchActions
 *
 * The workbench's actions alone. They never change identity, so a component
 * that only opens or focuses tabs does not re-render when the layout does.
 */
export type WorkbenchActions = Omit<WorkbenchContextValue, keyof Layout | "tabs" | "active">;

/**
 * ### SidebarWidths
 *
 * Sidebar widths in pixels. Apart from {@link WorkbenchContextValue} because a drag
 * changes them on every pointer move, and only the sidebars need them.
 */
export type SidebarWidths = { left: number; right: number };

const WorkbenchContext = createContext<WorkbenchContextValue | undefined>(undefined);
const WorkbenchActionsContext = createContext<WorkbenchActions | undefined>(undefined);
const SidebarWidthsContext = createContext<SidebarWidths | undefined>(undefined);

/** The saved layout as stored: untrusted, since older versions (or a hand edit) wrote it. */
function load(): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    // Narrowed to a plain object here; each field is checked where it is used.
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** How long the layout must stay unchanged before it is saved. */
const SAVE_DELAY_MS = 300;

/**
 * ### WorkbenchProvider
 *
 * Holds {@link WorkbenchContextValue} state. Starts with no tabs; restores the
 * last layout and tabs from localStorage after hydration.
 */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [{ tabs, activeKey }, dispatch] = useReducer(tabsReducer, { tabs: [], activeKey: undefined });
  const [restored, setRestored] = useState(false);
  // For actions, which keep one identity and so cannot read `layout` directly.
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    // Deferred a tick: localStorage is browser-only, and restoring sets state.
    const timer = setTimeout(() => {
      try {
        const saved = load();
        if (saved !== undefined) {
          setLayout(restoredLayout(saved));
          dispatch({ type: "restore", ...restoredTabs(saved) });
        }
      } catch (error) {
        // A saved layout that can't be read is ignored; the defaults stand and get saved over it.
        console.error("[mothership] ignored an unreadable saved layout", error);
      }
      setRestored(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const save = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...layout, tabs, activeKey, seenSections: SECTIONS } satisfies Saved));
      } catch {
        // Layout is a convenience; it just won't survive a reload.
      }
    };
    // Saved once the layout settles, not on every pixel of a sidebar drag; leaving the page saves at once.
    const timer = setTimeout(save, SAVE_DELAY_MS);
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [layout, tabs, activeKey, restored]);

  // Actions only dispatch or update functionally, so they never change identity.
  const actions = useMemo<WorkbenchActions>(() => {
    const open = (tab: Tab, options?: { preview?: boolean }) => {
      recordOpen(tab.kind === "section" ? `section:${tab.section}` : tab.kind);
      dispatch({ type: "open", tab, preview: options?.preview ?? false });
    };
    return {
      open,
      update: (tab: Tab) => dispatch({ type: "update", tab }),
      pin: (key: string) => dispatch({ type: "pin", key }),
      close: (key: string) => dispatch({ type: "close", keys: [key] }),
      closeMany: (keys: Array<string>) => dispatch({ type: "close", keys }),
      focus: (key: string) => dispatch({ type: "focus", key }),
      cycle: (delta: number) => dispatch({ type: "cycle", delta }),
      revealSection: (section: SectionId) => {
        const side = sideOf(layoutRef.current.sidebars, section);
        // Not in a sidebar: show it full size instead.
        if (side === undefined) {
          open({ kind: "section", section });
          return;
        }
        setLayout((l) => ({
          ...l,
          collapsed: l.collapsed.filter((s) => s !== section),
          ...(side === "left" ? { leftOpen: true } : { rightOpen: true }),
        }));
      },
      setSidebars: (sidebars: Sidebars) => setLayout((l) => ({ ...l, sidebars: normalizeSidebars(sidebars) })),
      placeSection: (section: SectionId, place: SectionPlace, before?: number) =>
        setLayout((l) => ({
          ...l,
          sidebars: dropSection(l.sidebars, section, place, before),
          ...(place === "left" ? { leftOpen: true } : place === "right" ? { rightOpen: true } : {}),
        })),
      toggleSection: (section: SectionId) =>
        setLayout((l) => ({
          ...l,
          collapsed: l.collapsed.includes(section) ? l.collapsed.filter((s) => s !== section) : [...l.collapsed, section],
        })),
      toggleLeft: () => setLayout((l) => ({ ...l, leftOpen: !l.leftOpen })),
      toggleRight: () => setLayout((l) => ({ ...l, rightOpen: !l.rightOpen })),
      toggleDetails: () => setLayout((l) => ({ ...l, detailsOpen: !l.detailsOpen })),
      setWidth: (side: "left" | "right", width: number) =>
        setLayout((l) => ({ ...l, [side === "left" ? "leftWidth" : "rightWidth"]: Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH) })),
    };
  }, []);

  const { sidebars, collapsed, leftOpen, rightOpen, detailsOpen, leftWidth, rightWidth } = layout;
  const value = useMemo<WorkbenchContextValue>(
    () => ({ sidebars, collapsed, leftOpen, rightOpen, detailsOpen, tabs, active: tabs.find((t) => t.key === activeKey), ...actions }),
    [sidebars, collapsed, leftOpen, rightOpen, detailsOpen, tabs, activeKey, actions],
  );
  const widths = useMemo<SidebarWidths>(() => ({ left: leftWidth, right: rightWidth }), [leftWidth, rightWidth]);

  return (
    <WorkbenchActionsContext.Provider value={actions}>
      <SidebarWidthsContext.Provider value={widths}>
        <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>
      </SidebarWidthsContext.Provider>
    </WorkbenchActionsContext.Provider>
  );
}

/**
 * ### useWorkbench
 *
 * @returns The workbench state and actions.
 */
export function useWorkbench(): WorkbenchContextValue {
  const workbench = useContext(WorkbenchContext);
  if (workbench === undefined) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return workbench;
}

/**
 * ### useWorkbenchActions
 *
 * For components that only act on the workbench (open a tab, reveal a
 * section): they skip the re-render every layout or tab change causes.
 *
 * @returns The stable workbench actions.
 */
export function useWorkbenchActions(): WorkbenchActions {
  const actions = useContext(WorkbenchActionsContext);
  if (actions === undefined) throw new Error("useWorkbenchActions must be used inside WorkbenchProvider");
  return actions;
}

/**
 * ### useSidebarWidths
 *
 * @returns The sidebar widths, which change on every pointer move of a drag.
 */
export function useSidebarWidths(): SidebarWidths {
  const widths = useContext(SidebarWidthsContext);
  if (widths === undefined) throw new Error("useSidebarWidths must be used inside WorkbenchProvider");
  return widths;
}
