import { describe, expect, it } from "vitest";
import { tabKey, type Tab } from "@/shell/tabs";
import { DEFAULT_LAYOUT, restoredLayout, restoredTabs, tabsReducer, type OpenTab, type TabsState } from "@/shell/workbenchState";

const pr = (number: number): Tab => ({ kind: "pr", repo: "a/b", number });
const open = (tab: Tab, preview = false): OpenTab => ({ key: tabKey(tab), tab, preview });
const state = (tabs: Array<OpenTab>, activeKey = tabs[0]?.key): TabsState => ({ tabs, activeKey });
const keys = (s: TabsState) => s.tabs.map((t) => t.key);

describe("tabsReducer", () => {
  it("focuses an open tab instead of adding a second copy, refreshing its fields", () => {
    const before = state([open({ kind: "inbox" }), open(pr(1))], "pr:a/b#1");
    const after = tabsReducer(before, { type: "open", tab: { kind: "inbox", questionId: "q1" }, preview: false });
    expect(keys(after)).toEqual(["inbox", "pr:a/b#1"]);
    expect(after.activeKey).toBe("inbox");
    expect(after.tabs[0].tab).toEqual({ kind: "inbox", questionId: "q1" });
  });

  it("replaces the preview tab with the next preview, in its place", () => {
    const before = state([open(pr(1)), open(pr(2), true), open(pr(3))]);
    const after = tabsReducer(before, { type: "open", tab: pr(4), preview: true });
    expect(keys(after)).toEqual(["pr:a/b#1", "pr:a/b#4", "pr:a/b#3"]);
    expect(after.activeKey).toBe("pr:a/b#4");
  });

  it("adds a pinned open at the end, keeping the preview", () => {
    const after = tabsReducer(state([open(pr(1), true)]), { type: "open", tab: pr(2), preview: false });
    expect(after.tabs.map((t) => [t.key, t.preview])).toEqual([
      ["pr:a/b#1", true],
      ["pr:a/b#2", false],
    ]);
  });

  it("pins a preview tab opened again without preview, and keeps a pinned one pinned when previewed", () => {
    expect(tabsReducer(state([open(pr(1), true)]), { type: "open", tab: pr(1), preview: false }).tabs[0].preview).toBe(false);
    expect(tabsReducer(state([open(pr(1))]), { type: "open", tab: pr(1), preview: true }).tabs[0].preview).toBe(false);
  });

  it("focuses the neighbour that takes the closed active tab's place, or the one before at the end", () => {
    const three = [open(pr(1)), open(pr(2)), open(pr(3))];
    expect(tabsReducer(state(three, "pr:a/b#2"), { type: "close", keys: ["pr:a/b#2"] }).activeKey).toBe("pr:a/b#3");
    expect(tabsReducer(state(three, "pr:a/b#3"), { type: "close", keys: ["pr:a/b#3"] }).activeKey).toBe("pr:a/b#2");
    expect(tabsReducer(state([open(pr(1))]), { type: "close", keys: ["pr:a/b#1"] }).activeKey).toBeUndefined();
  });

  it("keeps the active tab when another closes, and returns the same state when nothing closes", () => {
    const before = state([open(pr(1)), open(pr(2))], "pr:a/b#1");
    expect(tabsReducer(before, { type: "close", keys: ["pr:a/b#2"] }).activeKey).toBe("pr:a/b#1");
    expect(tabsReducer(before, { type: "close", keys: ["pr:a/b#9"] })).toBe(before);
  });

  it("cycles around both ends", () => {
    const before = state([open(pr(1)), open(pr(2))], "pr:a/b#2");
    expect(tabsReducer(before, { type: "cycle", delta: 1 }).activeKey).toBe("pr:a/b#1");
    expect(tabsReducer(state(before.tabs, "pr:a/b#1"), { type: "cycle", delta: -1 }).activeKey).toBe("pr:a/b#2");
  });

  it("updates only a tab that is open, without focusing it", () => {
    const before = state([open({ kind: "doc", itemId: "d", title: "" }), open(pr(1))], "pr:a/b#1");
    const after = tabsReducer(before, { type: "update", tab: { kind: "doc", itemId: "d", title: "Plan" } });
    expect(after.tabs[0].tab).toEqual({ kind: "doc", itemId: "d", title: "Plan" });
    expect(after.activeKey).toBe("pr:a/b#1");
    expect(tabsReducer(before, { type: "update", tab: pr(9) })).toBe(before);
  });

  it("restores saved tabs before ones a deep link opened first, keeping the deep link focused", () => {
    const linked = state([open(pr(2))]);
    const after = tabsReducer(linked, { type: "restore", tabs: [open(pr(1)), open(pr(2))], activeKey: "pr:a/b#1" });
    expect(keys(after)).toEqual(["pr:a/b#1", "pr:a/b#2"]);
    expect(after.activeKey).toBe("pr:a/b#2");
  });

  it("restores the saved active tab, or the first when it is gone", () => {
    const empty = state([]);
    expect(tabsReducer(empty, { type: "restore", tabs: [open(pr(1)), open(pr(2))], activeKey: "pr:a/b#2" }).activeKey).toBe("pr:a/b#2");
    expect(tabsReducer(empty, { type: "restore", tabs: [open(pr(1))], activeKey: "pr:a/b#9" }).activeKey).toBe("pr:a/b#1");
  });
});

describe("restoredLayout", () => {
  it("falls back field by field, so one bad value keeps the rest", () => {
    const layout = restoredLayout({ leftOpen: false, rightOpen: "yes", leftWidth: 400, rightWidth: 9_999, collapsed: ["docker", "gone"] });
    expect(layout).toMatchObject({ leftOpen: false, rightOpen: DEFAULT_LAYOUT.rightOpen, leftWidth: 400, rightWidth: DEFAULT_LAYOUT.rightWidth, collapsed: ["docker"] });
  });
});

describe("restoredTabs", () => {
  it("drops entries this version cannot draw and keeps the others", () => {
    const { tabs, activeKey } = restoredTabs({
      tabs: [null, "inbox", { tab: { kind: "removed-kind" } }, { tab: { kind: "pr", repo: "a/b", number: 1 }, preview: true }, { tab: { kind: "graph" } }],
      activeKey: 42,
    });
    expect(tabs).toEqual([
      { key: "pr:a/b#1", tab: pr(1), preview: true },
      { key: "graph", tab: { kind: "graph" }, preview: false },
    ]);
    expect(activeKey).toBeUndefined();
  });

  it("reads no tabs from a save without a list", () => {
    expect(restoredTabs({ tabs: "broken" }).tabs).toEqual([]);
  });
});
