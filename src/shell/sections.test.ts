import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/shell/tabs";
import { withNewSections } from "@/shell/sections";

describe("withNewSections", () => {
  it("adds a section new since the layout was saved after the one it follows by default", () => {
    const saved = { left: ["sessions", "inbox"] as const, right: ["slack"] as const };
    expect(withNewSections({ left: [...saved.left], right: [...saved.right] }, undefined)).toEqual({ left: ["sessions", "inbox", "todos"], right: ["slack"] });
  });

  it("leaves out sections the saved layout already knew of", () => {
    expect(withNewSections({ left: ["inbox"], right: [] }, [...SECTIONS])).toEqual({ left: ["inbox"], right: [] });
  });
});
