import { describe, expect, it } from "vitest";
import {
  connectionsNeedAttention,
  gmailAccountState,
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

const accounts = (youtube_music: AccountState = "unconfigured", gmail: AccountState = "unconfigured") => ({ youtube_music, gmail });

describe("connectionsNeedAttention", () => {
  it("stays quiet when every tool in use is set up", () => {
    expect(connectionsNeedAttention({ connections: [tool()], accounts: accounts("signed-in", "signed-in") })).toBe(false);
  });

  it("flags a tool turned on without its token, or a Google tool not signed in", () => {
    expect(connectionsNeedAttention({ connections: [tool({ secrets: [{ name: "SLACK_MCP_XOXP_TOKEN", set: false }] })], accounts: accounts() })).toBe(true);
    expect(connectionsNeedAttention({ connections: [tool({ id: "google_calendar", signedIn: false })], accounts: accounts() })).toBe(true);
  });

  it("ignores tools that are off, and YouTube Music or Gmail never set up", () => {
    const off = tool({ mode: "off", secrets: [{ name: "SLACK_MCP_XOXP_TOKEN", set: false }] });
    expect(connectionsNeedAttention({ connections: [off], accounts: accounts() })).toBe(false);
  });

  it("flags YouTube Music or Gmail set up but signed out or expired", () => {
    expect(connectionsNeedAttention({ connections: [], accounts: accounts("signed-out") })).toBe(true);
    expect(connectionsNeedAttention({ connections: [], accounts: accounts("expired") })).toBe(true);
    expect(connectionsNeedAttention({ connections: [], accounts: accounts("unconfigured", "expired") })).toBe(true);
  });
});

describe("account states", () => {
  it("counts Gmail as not set up until you sign in, though it shares Calendar's client", () => {
    expect(gmailAccountState("disconnected")).toBe("unconfigured");
    expect(gmailAccountState("expired")).toBe("expired");
    expect(gmailAccountState("connected")).toBe("signed-in");
  });
});
