import { DEFAULT_SIDEBARS, normalizeSidebars, withNewSections, type Sidebars } from "@/shell/sections";
import { COLLAPSED_BY_DEFAULT, isSectionId, parseTab, tabKey, type SectionId, type Tab } from "@/shell/tabs";

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

/**
 * ### OpenTab
 *
 * A tab in the strip. A `preview` tab (opened by a single click in a list)
 * is replaced by the next preview, like VS Code's.
 */
export type OpenTab = { key: string; tab: Tab; preview: boolean };

/**
 * ### Layout
 *
 * The workbench's arrangement apart from its tabs; saved with them.
 */
export type Layout = {
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

/**
 * ### DEFAULT_LAYOUT
 *
 * A fresh install's layout, and what each unreadable saved field falls back to.
 */
export const DEFAULT_LAYOUT: Layout = {
  sidebars: DEFAULT_SIDEBARS,
  collapsed: COLLAPSED_BY_DEFAULT,
  leftOpen: true,
  rightOpen: true,
  detailsOpen: false,
  leftWidth: 280,
  rightWidth: 320,
};

const isWidth = (value: unknown): value is number => typeof value === "number" && value >= SIDEBAR_MIN_WIDTH && value <= SIDEBAR_MAX_WIDTH;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * ### restoredLayout
 *
 * Reads a saved layout, which older versions or a hand edit may have
 * written: each field that is not valid now falls back to
 * {@link DEFAULT_LAYOUT} on its own, and sections added since the save
 * join the sidebars.
 *
 * @param saved - The stored object, each field still unchecked.
 */
export function restoredLayout(saved: Record<string, unknown>): Layout {
  return {
    sidebars: saved.sidebars === undefined ? DEFAULT_SIDEBARS : withNewSections(normalizeSidebars(saved.sidebars), saved.seenSections),
    collapsed: Array.isArray(saved.collapsed) ? saved.collapsed.filter(isSectionId) : DEFAULT_LAYOUT.collapsed,
    leftOpen: isBoolean(saved.leftOpen) ? saved.leftOpen : DEFAULT_LAYOUT.leftOpen,
    rightOpen: isBoolean(saved.rightOpen) ? saved.rightOpen : DEFAULT_LAYOUT.rightOpen,
    detailsOpen: isBoolean(saved.detailsOpen) ? saved.detailsOpen : DEFAULT_LAYOUT.detailsOpen,
    leftWidth: isWidth(saved.leftWidth) ? saved.leftWidth : DEFAULT_LAYOUT.leftWidth,
    rightWidth: isWidth(saved.rightWidth) ? saved.rightWidth : DEFAULT_LAYOUT.rightWidth,
  };
}

/**
 * ### restoredTabs
 *
 * Reads the saved tabs, dropping each entry this version cannot draw (see
 * `parseTab`), so one bad entry never loses the others.
 *
 * @param saved - The stored object, each field still unchecked.
 * @returns The tabs, with their keys made again from the tab, and the saved active key.
 */
export function restoredTabs(saved: Record<string, unknown>): { tabs: Array<OpenTab>; activeKey: string | undefined } {
  const tabs: Array<OpenTab> = [];
  for (const entry of Array.isArray(saved.tabs) ? saved.tabs : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const tab = parseTab((entry as { tab?: unknown }).tab);
    if (tab !== undefined) tabs.push({ key: tabKey(tab), tab, preview: (entry as { preview?: unknown }).preview === true });
  }
  return { tabs, activeKey: typeof saved.activeKey === "string" ? saved.activeKey : undefined };
}

/**
 * ### TabsState
 *
 * The open tabs, in strip order, and which one is shown.
 */
export type TabsState = { tabs: Array<OpenTab>; activeKey: string | undefined };

/**
 * ### TabsAction
 *
 * A change to {@link TabsState}; `restore` merges the saved tabs in after
 * hydration.
 */
export type TabsAction =
  | { type: "open"; tab: Tab; preview: boolean }
  | { type: "update"; tab: Tab }
  | { type: "close"; keys: Array<string> }
  | { type: "pin"; key: string }
  | { type: "focus"; key: string }
  | { type: "cycle"; delta: number }
  | { type: "restore"; tabs: Array<OpenTab>; activeKey: string | undefined };

/**
 * ### tabsReducer
 *
 * The tab strip's rules: opening an open tab focuses it (and pins it unless
 * opened as a preview again), a preview replaces the current preview,
 * closing the active tab focuses its neighbour, and restoring keeps tabs
 * opened before it (a deep link) open and focused. An action that changes
 * nothing returns `state` itself.
 */
export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  const { tabs, activeKey } = state;
  switch (action.type) {
    case "open": {
      const key = tabKey(action.tab);
      const existing = tabs.find((t) => t.key === key);
      if (existing !== undefined) {
        // Also refresh params (e.g. a focused question).
        return { tabs: tabs.map((t) => (t.key === key ? { key, tab: action.tab, preview: t.preview && action.preview } : t)), activeKey: key };
      }
      const added = { key, tab: action.tab, preview: action.preview };
      const previewIndex = action.preview ? tabs.findIndex((t) => t.preview) : -1;
      return {
        tabs: previewIndex === -1 ? [...tabs, added] : tabs.map((t, i) => (i === previewIndex ? added : t)),
        activeKey: key,
      };
    }
    case "update": {
      const key = tabKey(action.tab);
      return tabs.some((t) => t.key === key) ? { tabs: tabs.map((t) => (t.key === key ? { ...t, tab: action.tab } : t)), activeKey } : state;
    }
    case "close": {
      const next = tabs.filter((t) => !action.keys.includes(t.key));
      if (next.length === tabs.length) return state;
      if (activeKey === undefined || !action.keys.includes(activeKey)) return { tabs: next, activeKey };
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
      const opened = new Set(tabs.map((t) => t.key));
      const merged = [...action.tabs.filter((t) => !opened.has(t.key)), ...tabs];
      const savedActive = merged.some((t) => t.key === action.activeKey) ? action.activeKey : merged[0]?.key;
      return { tabs: merged, activeKey: activeKey ?? savedActive };
    }
  }
}
