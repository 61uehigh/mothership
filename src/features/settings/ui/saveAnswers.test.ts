import { describe, expect, it } from "vitest";
import { listWhileSaving, nextSaved, shownView, type SavedView } from "@/features/settings/ui/saveAnswers";

type View = { name: string };
const fetched: View = { name: "fetched" };

describe("nextSaved and shownView", () => {
  it("shows a save's answer over the fetched view it was made on", () => {
    const saved = nextSaved<View>(undefined, 1, { name: "saved" }, fetched);
    expect(shownView(saved, fetched)).toEqual({ name: "saved" });
  });

  it("an older save's answer never replaces a newer one", () => {
    const newer = nextSaved<View>(undefined, 2, { name: "second" }, fetched);
    const afterOlder = nextSaved(newer, 1, { name: "first" }, fetched);
    expect(shownView(afterOlder, fetched)).toEqual({ name: "second" });
  });

  it("a newer save's answer replaces an older one", () => {
    const older = nextSaved<View>(undefined, 1, { name: "first" }, fetched);
    expect(shownView(nextSaved(older, 2, { name: "second" }, fetched), fetched)).toEqual({ name: "second" });
  });

  it("a fresh fetch replaces a save's answer", () => {
    const saved = nextSaved<View>(undefined, 1, { name: "saved" }, fetched);
    const refetched: View = { name: "refetched" };
    expect(shownView(saved, refetched)).toBe(refetched);
  });

  it("a failed save leaves the shown view alone", () => {
    const saved: SavedView<View> = { view: { name: "saved" }, over: fetched, asked: 1 };
    expect(nextSaved(saved, 2, undefined, fetched)).toBe(saved);
    expect(nextSaved<View>(undefined, 2, undefined, fetched)).toBeUndefined();
  });
});

describe("listWhileSaving", () => {
  it("shows the list being saved, and holds further changes, until its save returns", () => {
    expect(listWhileSaving(["a", "b"], ["a"])).toEqual({ shown: ["a", "b"], locked: true });
    expect(listWhileSaving(undefined, ["a"])).toEqual({ shown: ["a"], locked: false });
  });
});
