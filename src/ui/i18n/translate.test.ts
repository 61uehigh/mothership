import { describe, expect, it } from "vitest";
import { dockerEn } from "@/ui/i18n/catalog/docker";
import { explorerEn } from "@/ui/i18n/catalog/explorer";
import { feedbackEn } from "@/ui/i18n/catalog/feedback";
import { githubEn } from "@/ui/i18n/catalog/github";
import { insightsEn } from "@/ui/i18n/catalog/insights";
import { serverEn } from "@/ui/i18n/catalog/server";
import { sessionsEn } from "@/ui/i18n/catalog/sessions";
import { settingsEn } from "@/ui/i18n/catalog/settings";
import { shellEn } from "@/ui/i18n/catalog/shell";
import { todosEn } from "@/ui/i18n/catalog/todos";
import { toolsEn } from "@/ui/i18n/catalog/tools";
import { uiEn } from "@/ui/i18n/catalog/ui";
import { en, ko } from "@/ui/i18n/messages";
import { translator } from "@/ui/i18n/translate";

describe("translator", () => {
  it("fills in placeholders", () => {
    expect(translator("en")("tab.changes", { name: "fix-login" })).toBe("Changes · fix-login");
    expect(translator("ko")("titleBar.andMore", { name: "a", count: 2 })).toBe("a 외 2개:");
  });

  it("keeps the same placeholders in every language", () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>) expect(names(ko[key]), key).toEqual(names(en[key]));
  });
});

describe("catalogs", () => {
  it("never define the same key twice, which would silently override", () => {
    const keys = [uiEn, shellEn, settingsEn, sessionsEn, todosEn, githubEn, dockerEn, explorerEn, toolsEn, insightsEn, feedbackEn, serverEn].flatMap((catalog) => Object.keys(catalog));
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });
});
