import { describe, expect, it } from "vitest";
import {
  connectionsNeedAttention,
  kakaoAccountState,
  youTubeAccountState,
  type AccountState,
  type ConnectionView,
} from "@/features/settings/model/Settings";

const tool = (change: Partial<ConnectionView> = {}): ConnectionView => ({
  id: "slack",
  mode: "mcp",
  chosen: false,
  modes: ["mcp", "off"],
  secrets: [{ name: "SLACK_MCP_XOXP_TOKEN", set: true }],
  connector: undefined,
  ...change,
});

const accounts = (kakaotalk: AccountState = "unconfigured", youtube_music: AccountState = "unconfigured") => ({ kakaotalk, youtube_music });

describe("connectionsNeedAttention", () => {
  it("stays quiet when every tool in use is set up", () => {
    expect(connectionsNeedAttention({ connections: [tool()], accounts: accounts("signed-in", "signed-in") })).toBe(false);
  });

  it("flags a tool turned on without its token, or a Google tool not signed in", () => {
    expect(connectionsNeedAttention({ connections: [tool({ secrets: [{ name: "SLACK_MCP_XOXP_TOKEN", set: false }] })], accounts: accounts() })).toBe(true);
    expect(connectionsNeedAttention({ connections: [tool({ id: "google_calendar", signedIn: false })], accounts: accounts() })).toBe(true);
  });

  it("ignores tools that are off, and KakaoTalk or YouTube Music never set up", () => {
    const off = tool({ mode: "off", secrets: [{ name: "SLACK_MCP_XOXP_TOKEN", set: false }] });
    expect(connectionsNeedAttention({ connections: [off], accounts: accounts() })).toBe(false);
  });

  it("flags KakaoTalk or YouTube Music set up but signed out or expired", () => {
    expect(connectionsNeedAttention({ connections: [], accounts: accounts("signed-out") })).toBe(true);
    expect(connectionsNeedAttention({ connections: [], accounts: accounts("unconfigured", "expired") })).toBe(true);
    expect(connectionsNeedAttention({ connections: [], accounts: accounts("unconfigured", "signed-out") })).toBe(true);
  });
});

describe("account states", () => {
  it("reads KakaoTalk as unconfigured without a key, whatever the stored sign-in", () => {
    expect(kakaoAccountState({ keySet: false, secretSet: false, connected: false })).toBe("unconfigured");
    expect(kakaoAccountState({ keySet: true, secretSet: false, connected: false })).toBe("signed-out");
    expect(kakaoAccountState({ keySet: true, secretSet: true, connected: true })).toBe("signed-in");
  });

  it("maps each YouTube Music sign-in state", () => {
    expect(youTubeAccountState("unconfigured")).toBe("unconfigured");
    expect(youTubeAccountState("disconnected")).toBe("signed-out");
    expect(youTubeAccountState("expired")).toBe("expired");
    expect(youTubeAccountState("connected")).toBe("signed-in");
  });
});
