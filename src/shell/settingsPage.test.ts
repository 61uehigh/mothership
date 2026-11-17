import { describe, expect, it } from "vitest";
import { SETTINGS_PAGES } from "@/features/settings/model/Settings";
import { parseSettingsPage, settingsMenuPage } from "@/shell/settingsPage";
import { parseTab, tabKey } from "@/shell/tabs";

describe("Settings destinations", () => {
  it("keeps the six menu pages and selects Workspace for a direct Meetings entry", () => {
    expect(SETTINGS_PAGES).toEqual(["general", "profile", "agents", "connections", "workspace", "advanced"]);
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
  ])("restores the previous %s destination", (saved, expected) => {
    expect(parseSettingsPage(saved)).toBe(expected);
  });
});

describe("Status detail tabs", () => {
  it.each(["agent-limits", "system"] as const)("restores %s as a distinct tab", (kind) => {
    expect(parseTab({ kind })).toEqual({ kind });
    expect(tabKey({ kind })).toBe(kind);
  });
});
