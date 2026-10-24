"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { DEFAULT_SIDEBARS, normalizeSidebars, sideOf, type Sidebars } from "@/shell/sections";
import { COLLAPSED_BY_DEFAULT, parseTab, SECTIONS, tabKey, type SectionId, type Tab } from "@/shell/tabs";

const STORAGE_KEY = "mothership.workbench";

/**
 * ### SIDEBAR_MIN_WIDTH
 *
 * Narrowest a sidebar can be resized to, in pixels.
 */
export const SIDEBAR_MIN_WIDTH = 180;

/**
 * ### SIDEBAR_MAX_WIDTH
 *
 * Widest a sidebar can be resized to, in pixels.
 */
export const SIDEBAR_MAX_WIDTH = 560;

type OpenTab = { key: string; tab: Tab; preview: boolean };

type Layout = {
  /** Which sections each sidebar shows, in order (chosen in Settings). */
  sidebars: Sidebars;
  /** Sections folded to their header. */
  collapsed: Array<SectionId>;
  leftOpen: boolean;
  rightOpen: boolean;
  /** The details column beside a tab (session info, PR checks); folded by default. */
  detailsOpen: boolean;
  leftWidth: number;
  rightWidth: number;
};

type Saved = Layout & { tabs: Array<OpenTab>; activeKey: string | undefined };

const DEFAULT_LAYOUT: Layout = {
  sidebars: DEFAULT_SIDEBARS,
  collapsed: COLLAPSED_BY_DEFAULT,
  leftOpen: true,
  rightOpen: true,
  detailsOpen: false,
  leftWidth: 280,
  rightWidth: 320,
};

/**
 * ### Workbench
 *
 * Shared state of the layout: open tabs, the active tab, folded sections,
 * and sidebar sizes. Persisted per browser.
 */
export type Workbench = Layout & {
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
  /** Folds or unfolds a stacked section. */
  toggleSection: (section: SectionId) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleDetails: () => void;
  setWidth: (side: "left" | "right", width: number) => void;
};

const WorkbenchContext = createContext<Workbench | undefined>(undefined);

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

const isWidth = (value: unknown): value is number => typeof value === "number" && value >= SIDEBAR_MIN_WIDTH && value <= SIDEBAR_MAX_WIDTH;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

type TabsState = { tabs: Array<OpenTab>; activeKey: string | undefined };
type TabsAction =
  | { type: "open"; tab: Tab; preview: boolean }
  | { type: "close"; keys: Array<string> }
  | { type: "pin"; key: string }
  | { type: "focus"; key: string }
  | { type: "cycle"; delta: number }
  | { type: "restore"; tabs: Array<OpenTab>; activeKey: string | undefined };

function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  const { tabs, activeKey } = state;
  switch (action.type) {
    case "open": {
      const key = tabKey(action.tab);
      const existing = tabs.find((t) => t.key === key);
      if (existing !== undefined) {
        // Re-opening without preview pins it; also refresh params (e.g. a focused question).
        return { tabs: tabs.map((t) => (t.key === key ? { key, tab: action.tab, preview: t.preview && action.preview } : t)), activeKey: key };
      }
      const added = { key, tab: action.tab, preview: action.preview };
      const previewIndex = action.preview ? tabs.findIndex((t) => t.preview) : -1;
      return {
        tabs: previewIndex === -1 ? [...tabs, added] : tabs.map((t, i) => (i === previewIndex ? added : t)),
        activeKey: key,
      };
    }
    case "close": {
      const next = tabs.filter((t) => !action.keys.includes(t.key));
      if (next.length === tabs.length) return state;
      if (activeKey === undefined || !action.keys.includes(activeKey)) return { tabs: next, activeKey };
      // Closing the active tab focuses its neighbour, like an editor.
      const index = tabs.findIndex((t) => t.key === activeKey);
      return { tabs: next, activeKey: next[Math.min(index, next.length - 1)]?.key };
    }
    case "pin":
      return { tabs: tabs.map((t) => (t.key === action.key ? { ...t, preview: false } : t)), activeKey };
    case "focus":
      return tabs.some((t) => t.key === action.key) ? { tabs, activeKey: action.key } : state;
    case "cycle": {
      if (tabs.length === 0) return state;
      const index = tabs.findIndex((t) => t.key === activeKey);
      return { tabs, activeKey: tabs[(index + action.delta + tabs.length) % tabs.length].key };
    }
    case "restore": {
      // Tabs opened before restoring (a deep link from Slack or a notification) stay open and focused.
      const opened = new Set(tabs.map((t) => t.key));
      const merged = [...action.tabs.filter((t) => !opened.has(t.key)), ...tabs];
      const savedActive = merged.some((t) => t.key === action.activeKey) ? action.activeKey : merged[0]?.key;
      return { tabs: merged, activeKey: activeKey ?? savedActive };
    }
  }
}

/**
 * ### WorkbenchProvider
 *
 * Holds {@link Workbench} state. Starts with no tabs; restores the
 * last layout and tabs from localStorage after hydration.
 */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [{ tabs, activeKey }, dispatch] = useReducer(tabsReducer, { tabs: [], activeKey: undefined });
  const [restored, setRestored] = useState(false);

  /** Applies a saved layout, keeping only the parts that are valid now. */
  function restore(saved: Record<string, unknown>) {
    setLayout({
      sidebars: saved.sidebars === undefined ? DEFAULT_SIDEBARS : normalizeSidebars(saved.sidebars),
      collapsed: Array.isArray(saved.collapsed)
        ? saved.collapsed.filter((s): s is SectionId => (SECTIONS as ReadonlyArray<unknown>).includes(s))
        : DEFAULT_LAYOUT.collapsed,
      leftOpen: isBoolean(saved.leftOpen) ? saved.leftOpen : DEFAULT_LAYOUT.leftOpen,
      rightOpen: isBoolean(saved.rightOpen) ? saved.rightOpen : DEFAULT_LAYOUT.rightOpen,
      detailsOpen: isBoolean(saved.detailsOpen) ? saved.detailsOpen : DEFAULT_LAYOUT.detailsOpen,
      leftWidth: isWidth(saved.leftWidth) ? saved.leftWidth : DEFAULT_LAYOUT.leftWidth,
      rightWidth: isWidth(saved.rightWidth) ? saved.rightWidth : DEFAULT_LAYOUT.rightWidth,
    });
    const tabs: Array<OpenTab> = [];
    for (const entry of Array.isArray(saved.tabs) ? saved.tabs : []) {
      if (typeof entry !== "object" || entry === null) continue;
      const tab = parseTab((entry as { tab?: unknown }).tab);
      if (tab !== undefined) tabs.push({ key: tabKey(tab), tab, preview: (entry as { preview?: unknown }).preview === true });
    }
    dispatch({ type: "restore", tabs, activeKey: typeof saved.activeKey === "string" ? saved.activeKey : undefined });
  }

  useEffect(() => {
    // Deferred a tick: localStorage is browser-only, and restoring sets state.
    const timer = setTimeout(() => {
      try {
        const saved = load();
        if (saved !== undefined) restore(saved);
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...layout, tabs, activeKey } satisfies Saved));
    } catch {
      // Layout is a convenience; it just won't survive a reload.
    }
  }, [layout, tabs, activeKey, restored]);

  // Actions only dispatch or update functionally, so they never change identity.
  const actions = useMemo(
    () => ({
      open: (tab: Tab, options?: { preview?: boolean }) => dispatch({ type: "open", tab, preview: options?.preview ?? false }),
      pin: (key: string) => dispatch({ type: "pin", key }),
      close: (key: string) => dispatch({ type: "close", keys: [key] }),
      closeMany: (keys: Array<string>) => dispatch({ type: "close", keys }),
      focus: (key: string) => dispatch({ type: "focus", key }),
      cycle: (delta: number) => dispatch({ type: "cycle", delta }),
      revealSection: (section: SectionId) =>
        setLayout((l) => {
          const side = sideOf(l.sidebars, section);
          // Not in a sidebar: show it full size instead (a dispatch, not a layout change).
          if (side === undefined) setTimeout(() => dispatch({ type: "open", tab: { kind: "section", section }, preview: false }), 0);
          return {
            ...l,
            collapsed: l.collapsed.filter((s) => s !== section),
            ...(side === "left" ? { leftOpen: true } : side === "right" ? { rightOpen: true } : {}),
          };
        }),
      setSidebars: (sidebars: Sidebars) => setLayout((l) => ({ ...l, sidebars: normalizeSidebars(sidebars) })),
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
    }),
    [],
  );

  const value = useMemo<Workbench>(
    () => ({ ...layout, tabs, active: tabs.find((t) => t.key === activeKey), ...actions }),
    [layout, tabs, activeKey, actions],
  );

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

/**
 * ### useWorkbench
 *
 * @returns The workbench state and actions.
 */
export function useWorkbench(): Workbench {
  const workbench = useContext(WorkbenchContext);
  if (workbench === undefined) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return workbench;
}
