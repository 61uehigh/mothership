import { describe, expect, it } from "vitest";
import type { ConnectionView } from "@/features/settings/model/Settings";
import type { ConnectionStatus } from "@/features/youtube-music/model/YouTubeMusic";
import { isMcpDisconnected, kakaoMacChip, kakaoMacSteps, kakaoMemoChip, mcpConnectionChip, youTubeChip } from "@/features/settings/model/connectionStatus";

const linear = (patch: Partial<ConnectionView> = {}): ConnectionView => ({
  id: "linear",
  mode: "mcp",
  chosen: false,
  modes: ["mcp", "claude", "off"],
  secrets: [{ name: "LINEAR_API_KEY", set: true }],
  connector: "Linear",
  ...patch,
});

describe("mcpConnectionChip", () => {
  it("asks for setup before trusting an old test when the token is missing or unusable", () => {
    const passed = { ok: true as const, items: 3 };
    expect(mcpConnectionChip(linear({ secrets: [{ name: "LINEAR_API_KEY", set: false }] }), passed).state).toBe("not-set-up");
    expect(mcpConnectionChip(linear({ secrets: [{ name: "LINEAR_API_KEY", set: true, problem: "gone" }] }), passed).state).toBe("not-set-up");
    expect(mcpConnectionChip(linear(), passed).state).toBe("connected");
  });

  it("does not need a token in claude.ai connector mode", () => {
    expect(mcpConnectionChip(linear({ mode: "claude", secrets: [{ name: "LINEAR_API_KEY", set: false }] }), undefined).state).toBe("not-tested");
  });

  it("names sign-in failures and folds every other failure into Not working", () => {
    const failed = (cause: "expired" | "signin" | "token" | "rate-limited") => ({
      ok: false as const,
      message: "x",
      problem: { cause, label: "x", summary: "x" },
    });
    expect(mcpConnectionChip(linear(), failed("expired"))).toMatchObject({ state: "expired", tone: "bad" });
    expect(mcpConnectionChip(linear(), failed("signin"))).toMatchObject({ state: "needs-sign-in", tone: "warn" });
    expect(mcpConnectionChip(linear(), failed("token"))).toMatchObject({ state: "not-working", tone: "bad" });
    expect(mcpConnectionChip(linear(), failed("rate-limited"))).toMatchObject({ state: "not-working", tone: "warn" });
  });

  it("asks Google Calendar to sign in once its client file is saved", () => {
    const calendar = linear({ id: "google_calendar", secrets: [{ name: "GOOGLE_OAUTH_CREDENTIALS", set: true }], signedIn: false });
    expect(mcpConnectionChip(calendar, undefined).state).toBe("needs-sign-in");
  });
});

describe("isMcpDisconnected", () => {
  const failed = (cause: "expired" | "token" | "rate-limited" | "network") => ({
    ok: false as const,
    message: "x",
    problem: { cause, label: "x", summary: "x" },
  });

  it("recognizes off, missing setup and invalid or expired sign-ins", () => {
    expect(isMcpDisconnected(linear({ mode: "off" }))).toBe(true);
    expect(isMcpDisconnected(linear({ secrets: [{ name: "LINEAR_API_KEY", set: false }] }))).toBe(true);
    expect(isMcpDisconnected(linear({ id: "google_calendar", signedIn: false }))).toBe(true);
    expect(isMcpDisconnected(linear({ last: failed("expired") }))).toBe(true);
    expect(isMcpDisconnected(linear({ last: failed("token") }))).toBe(true);
  });

  it("keeps configured rules editable before a test and during temporary failures", () => {
    expect(isMcpDisconnected(linear())).toBe(false);
    expect(isMcpDisconnected(linear({ last: failed("rate-limited") }))).toBe(false);
    expect(isMcpDisconnected(linear({ last: failed("network") }))).toBe(false);
    expect(isMcpDisconnected(linear({ mode: "claude", secrets: [{ name: "LINEAR_API_KEY", set: false }] }))).toBe(false);
  });
});

describe("youTubeChip", () => {
  const status = (state: ConnectionStatus["state"]): ConnectionStatus => ({
    state,
    clientSaved: state !== "unconfigured",
    reason: undefined,
    projectId: undefined,
    account: undefined,
    email: undefined,
    signInError: undefined,
  });

  it("follows the sign-in, unless a failure says more", () => {
    expect(youTubeChip(undefined, undefined).state).toBe("checking");
    expect(youTubeChip(status("unconfigured"), undefined).state).toBe("not-set-up");
    expect(youTubeChip(status("disconnected"), undefined).state).toBe("needs-sign-in");
    expect(youTubeChip(status("connected"), undefined).state).toBe("connected");
    expect(youTubeChip(status("connected"), { problem: { cause: "quota", label: "x", summary: "x" } }).state).toBe("not-working");
    expect(youTubeChip(status("connected"), { problem: { cause: "expired", label: "x", summary: "x" } }).state).toBe("expired");
  });
});

describe("kakaoMemoChip", () => {
  it("needs the key first, then a sign-in", () => {
    expect(kakaoMemoChip({ keySet: false, secretSet: true, connected: false }).state).toBe("not-set-up");
    expect(kakaoMemoChip({ keySet: true, secretSet: false, connected: false }).state).toBe("needs-sign-in");
    expect(kakaoMemoChip({ keySet: true, secretSet: false, connected: true }).state).toBe("connected");
  });
});

describe("kakaoMacSteps", () => {
  it("marks nothing done until KakaoTalk is open to check", () => {
    const none = { appOpen: false, accessibility: false, automation: false, chatsTab: false };
    expect(kakaoMacSteps(undefined)).toEqual(none);
    expect(kakaoMacSteps({ state: "not-running" })).toEqual(none);
  });

  it("counts Automation as granted only when Accessibility was the one refused", () => {
    expect(kakaoMacSteps({ state: "no-access", missing: "accessibility", detail: "", unread: undefined })).toEqual({
      appOpen: true,
      accessibility: false,
      automation: true,
      chatsTab: false,
    });
    expect(kakaoMacSteps({ state: "no-access", missing: "automation", detail: "", unread: undefined })).toEqual({
      appOpen: true,
      accessibility: false,
      automation: false,
      chatsTab: false,
    });
  });

  it("has both permissions once the window could be read", () => {
    expect(kakaoMacSteps({ state: "no-list", unread: undefined })).toEqual({ appOpen: true, accessibility: true, automation: true, chatsTab: false });
    expect(kakaoMacSteps({ state: "ok", chats: [], unread: 0 })).toEqual({ appOpen: true, accessibility: true, automation: true, chatsTab: true });
    expect(kakaoMacChip({ state: "ok", chats: [], unread: 0 }).state).toBe("connected");
    expect(kakaoMacChip({ state: "no-access", missing: "automation", detail: "", unread: undefined })).toMatchObject({ state: "not-set-up", tone: "warn" });
  });
});
