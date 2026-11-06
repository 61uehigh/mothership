import { describe, expect, it } from "vitest";
import { parseSettingsPage, settingsMenuPage } from "@/shell/settingsPage";

describe("Settings destinations", () => {
  it("selects Workspace in the menu for a direct Workspace entry", () => {
    expect(parseSettingsPage("workspace/meetings")).toBe("workspace/meetings");
    expect(settingsMenuPage("workspace/meetings")).toBe("workspace");
  });

  it.each([
    ["tools", "connections"],
    ["developer", "advanced"],
    ["sidebars", "workspace"],
    ["inbox", "workspace/inbox"],
    ["meetings", "workspace/meetings"],
    ["usage", "agents"],
    ["system", "general"],
    ["unknown", undefined],
  ])("restores the older saved %s destination", (saved, expected) => {
    expect(parseSettingsPage(saved)).toBe(expected);
  });
});
