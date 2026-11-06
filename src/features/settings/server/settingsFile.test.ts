import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INBOX_RULES } from "@/features/inbox/model/Inbox";
import { applySettingsPatch, parseSettingsText, updateSettings, type StoredSettings } from "@/features/settings/server/settingsFile";

const saved: StoredSettings = {
  setupDone: true,
  autoContinue: false,
  promptSuggestions: true,
  defaultFolder: "/work",
  developer: { enabled: true, sourceFolder: "/src/mothership" },
  inbox: DEFAULT_INBOX_RULES,
  meetings: { collections: [] },
  connections: { slack: "mcp", linear: "claude" },
  profile: { names: ["Jane"], slackUserId: "U0123456789" },
  timezone: "Asia/Seoul",
};

describe("applySettingsPatch", () => {
  it("keeps what the change leaves out", () => {
    expect(applySettingsPatch(saved, {})).toEqual(saved);
  });

  it("clears text fields set to empty and forgets connections set to default", () => {
    const next = applySettingsPatch(saved, { defaultFolder: "", profile: { slackUserId: "" }, timezone: "", developer: { sourceFolder: "" }, connections: { slack: "default", notion: "off" } });
    expect(next.defaultFolder).toBeUndefined();
    expect(next.profile).toEqual({ names: ["Jane"], slackUserId: undefined });
    expect(next.timezone).toBeUndefined();
    expect(next.developer).toEqual({ enabled: true, sourceFolder: undefined });
    expect(next.connections).toEqual({ linear: "claude", notion: "off" });
  });

  it("merges Inbox rules one by one", () => {
    const next = applySettingsPatch(saved, { inbox: { claudeReview: !DEFAULT_INBOX_RULES.claudeReview } });
    expect(next.inbox).toEqual({ ...DEFAULT_INBOX_RULES, claudeReview: !DEFAULT_INBOX_RULES.claudeReview });
  });

  it("saves a new default lead and keeps it when the change leaves it out", () => {
    const codex = { provider: "codex" as const, model: undefined, effort: "high" as const };
    const next = applySettingsPatch(saved, { lead: codex });
    expect(next.lead).toEqual(codex);
    expect(applySettingsPatch(next, {}).lead).toEqual(codex);
  });
});

describe("parseSettingsText", () => {
  it("keeps every valid value when one field or entry is invalid", () => {
    const text = JSON.stringify({ ...saved, autoContinue: "yes", connections: { slack: "mcp", removed_tool: "off", linear: "bogus" }, profile: { names: ["Jane", "J"] }, inbox: { ...DEFAULT_INBOX_RULES, myPr: "someday" } });
    const { settings, dropped } = parseSettingsText(text);
    expect(dropped).toBe(true);
    expect(settings.setupDone).toBe(true);
    expect(settings.autoContinue).toBe(false);
    expect(settings.defaultFolder).toBe("/work");
    expect(settings.developer).toEqual(saved.developer);
    expect(settings.connections).toEqual({ slack: "mcp" });
    expect(settings.profile).toEqual({ names: ["Jane"] });
    expect(settings.timezone).toBe("Asia/Seoul");
    expect(settings.inbox).toEqual(DEFAULT_INBOX_RULES);
  });

  it("keeps a time zone chosen under the old profile.timezone unless one is set at the top", () => {
    const legacy = { ...saved, timezone: undefined, profile: { names: ["Jane"], timezone: "Europe/Berlin" } };
    expect(parseSettingsText(JSON.stringify(legacy)).settings.timezone).toBe("Europe/Berlin");
    expect(parseSettingsText(JSON.stringify({ ...legacy, timezone: "Asia/Tokyo" })).settings.timezone).toBe("Asia/Tokyo");
  });

  it("reports nothing dropped for a valid file", () => {
    expect(parseSettingsText(JSON.stringify(saved))).toEqual({ settings: saved, dropped: false });
  });

  it("falls back to defaults for text that is not JSON", () => {
    const { settings, dropped } = parseSettingsText("{ broken");
    expect(dropped).toBe(true);
    expect(settings.setupDone).toBe(false);
  });
});

describe("updateSettings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a copy of a file that did not parse before writing over it", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "settings-"));
    vi.stubEnv("MOTHERSHIP_DATA_DIR", folder);
    await mkdir(path.join(folder, ".mothership"));
    const file = path.join(folder, ".mothership", "settings.json");
    await writeFile(file, "{ hand-broken");
    await updateSettings((current) => ({ ...current, autoContinue: true }));
    const backup = (await readdir(path.join(folder, ".mothership"))).find((name) => name.startsWith("settings.json.bad-"));
    expect(backup).toBeDefined();
    expect(await readFile(path.join(folder, ".mothership", backup ?? ""), "utf8")).toBe("{ hand-broken");
    expect(JSON.parse(await readFile(file, "utf8")).autoContinue).toBe(true);
  });

  it("writes without a copy when the file is valid or missing", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "settings-"));
    vi.stubEnv("MOTHERSHIP_DATA_DIR", folder);
    await updateSettings((current) => ({ ...current, setupDone: true }));
    await updateSettings((current) => ({ ...current, autoContinue: true }));
    expect(await readdir(path.join(folder, ".mothership"))).toEqual(["settings.json"]);
    expect(JSON.parse(await readFile(path.join(folder, ".mothership", "settings.json"), "utf8"))).toMatchObject({ setupDone: true, autoContinue: true });
  });
});
