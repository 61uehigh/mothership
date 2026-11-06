import { describe, expect, it } from "vitest";
import { DEFAULT_INBOX_RULES } from "@/features/inbox/model/Inbox";
import { applySettingsPatch, savedLead, type StoredSettings } from "@/features/settings/server/settingsStore";
import { DEFAULT_LEAD } from "@/features/sessions/model/Lead";

const saved: StoredSettings = {
  setupDone: true,
  defaultFolder: "/work",
  developer: { enabled: true, sourceFolder: "/src/mothership" },
  inbox: DEFAULT_INBOX_RULES,
  meetings: { collections: [] },
  connections: { slack: "mcp", linear: "claude" },
  profile: { names: ["Jane"], slackUserId: "U0123456789", timezone: "Asia/Seoul" },
};

describe("applySettingsPatch", () => {
  it("keeps what the change leaves out", () => {
    expect(applySettingsPatch(saved, {})).toEqual(saved);
  });

  it("clears text fields set to empty and forgets connections set to default", () => {
    const next = applySettingsPatch(saved, { defaultFolder: "", profile: { slackUserId: "" }, developer: { sourceFolder: "" }, connections: { slack: "default", notion: "off" } });
    expect(next.defaultFolder).toBeUndefined();
    expect(next.profile).toEqual({ names: ["Jane"], slackUserId: undefined, timezone: "Asia/Seoul" });
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

describe("savedLead", () => {
  it("is Claude until you choose another", () => {
    expect(savedLead({ lead: undefined })).toEqual(DEFAULT_LEAD);
    expect(savedLead({ lead: { provider: "codex" } })).toEqual({ provider: "codex", model: undefined, effort: undefined });
  });
});
