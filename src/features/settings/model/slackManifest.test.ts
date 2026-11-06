import { describe, expect, it } from "vitest";
import { slackCreateAppUrl, slackManifest, slackScopes } from "@/features/settings/model/slackManifest";

describe("slackScopes", () => {
  it("always includes the search scopes the sidebar needs, and adds each chosen permission's scopes once", () => {
    const search = slackScopes([]);
    expect(search).toEqual(["search:read.public", "search:read.private", "search:read.im", "search:read.mpim", "search:read.users"]);
    expect(slackScopes(["send", "search", "send"])).toEqual([...search, "chat:write"]);
  });
});

describe("slackManifest", () => {
  it("asks for user scopes only, turns on MCP access, keeps token rotation off, and travels whole in Slack's new-app link", () => {
    const manifest = slackManifest(["send"]) as { oauth_config: { scopes: Record<string, Array<string>> }; settings: Record<string, unknown> };
    expect(Object.keys(manifest.oauth_config.scopes)).toEqual(["user"]);
    expect(manifest.oauth_config.scopes.user).toContain("chat:write");
    expect(manifest.settings.is_mcp_enabled).toBe(true);
    expect(manifest.settings.token_rotation_enabled).toBe(false);
    const url = new URL(slackCreateAppUrl(["send"]));
    expect(url.origin + url.pathname).toBe("https://api.slack.com/apps");
    expect(JSON.parse(url.searchParams.get("manifest_json") ?? "")).toEqual(manifest);
  });
});
