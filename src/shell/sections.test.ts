import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/shell/tabs";
import { dropSection, moveSection, shiftSection, withNewSections, type Sidebars } from "@/shell/sections";

describe("withNewSections", () => {
  it("adds a section new since the layout was saved after the one it follows by default", () => {
    const saved = { left: ["sessions", "inbox"] as const, right: ["slack"] as const };
    expect(withNewSections({ left: [...saved.left], right: [...saved.right] }, undefined)).toEqual({ left: ["sessions", "inbox", "todos"], right: ["slack"] });
  });

  it("leaves out sections the saved layout already knew of", () => {
    expect(withNewSections({ left: ["inbox"], right: [] }, [...SECTIONS])).toEqual({ left: ["inbox"], right: [] });
  });
});

const layout = (): Sidebars => ({ left: ["inbox", "todos", "sessions"], right: ["slack", "linear"] });

describe("moveSection", () => {
  it("moves a section to the other sidebar at the given place", () => {
    expect(moveSection(layout(), "todos", "right", 1)).toEqual({ left: ["inbox", "sessions"], right: ["slack", "todos", "linear"] });
  });

  it("adds to the end when no place is given, or one past the end", () => {
    expect(moveSection(layout(), "inbox", "right")).toEqual({ left: ["todos", "sessions"], right: ["slack", "linear", "inbox"] });
    expect(moveSection(layout(), "inbox", "right", 99)).toEqual({ left: ["todos", "sessions"], right: ["slack", "linear", "inbox"] });
  });

  it("takes a section out of both sidebars when hidden", () => {
    expect(moveSection(layout(), "slack", "hidden")).toEqual({ left: ["inbox", "todos", "sessions"], right: ["linear"] });
  });

  it("leaves the layout it was given unchanged", () => {
    const before = layout();
    moveSection(before, "inbox", "right");
    expect(before).toEqual(layout());
  });
});

describe("dropSection", () => {
  it("drops before the section at the index, counting lower spots in its own list before it moved out", () => {
    // Dropped between "todos" and "sessions" (before index 2): it lands after "todos".
    expect(dropSection(layout(), "inbox", "left", 2).left).toEqual(["todos", "inbox", "sessions"]);
    // Dropped below the last section.
    expect(dropSection(layout(), "inbox", "left", 3).left).toEqual(["todos", "sessions", "inbox"]);
  });

  it("drops higher in its own list at that index", () => {
    expect(dropSection(layout(), "sessions", "left", 0).left).toEqual(["sessions", "inbox", "todos"]);
  });

  it("leaves the order alone when dropped right above or below itself", () => {
    expect(dropSection(layout(), "todos", "left", 1)).toEqual(layout());
    expect(dropSection(layout(), "todos", "left", 2)).toEqual(layout());
  });

  it("drops into the other sidebar at the index as is", () => {
    expect(dropSection(layout(), "inbox", "right", 1)).toEqual({ left: ["todos", "sessions"], right: ["slack", "inbox", "linear"] });
  });
});

describe("shiftSection", () => {
  it("moves a section one place up or down in its sidebar", () => {
    expect(shiftSection(layout(), "todos", -1).left).toEqual(["todos", "inbox", "sessions"]);
    expect(shiftSection(layout(), "todos", 1).left).toEqual(["inbox", "sessions", "todos"]);
  });

  it("returns the same layout at the ends or for a hidden section", () => {
    const sidebars = layout();
    expect(shiftSection(sidebars, "inbox", -1)).toBe(sidebars);
    expect(shiftSection(sidebars, "linear", 1)).toBe(sidebars);
    expect(shiftSection(sidebars, "docker", 1)).toBe(sidebars);
  });
});
