import { describe, expect, it } from "vitest";
import type { ConnectionView } from "@/features/settings/model/Settings";
import type { ConnectionStatus } from "@/features/youtube-music/model/YouTubeMusic";
import { availableModes, isMcpDisconnected, kakaoMacChip, kakaoMacSteps, mcpConnectionChip, modeFromFiles, googleSignInChip, signInOutcome, switchReady } from "@/features/settings/model/connectionStatus";

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
    expect(mcpConnectionChip(linear({ secrets: [{ name: "LINEAR_API_KEY", set: true, problem: "file-missing" }] }), passed).state).toBe("not-set-up");
    expect(mcpConnectionChip(linear(), passed).state).toBe("connected");
  });

  it("says checking while a test runs, whatever was seen before", () => {
    expect(mcpConnectionChip(linear(), undefined, true).state).toBe("checking");
    expect(mcpConnectionChip(linear(), { ok: true, items: 3 }, true).state).toBe("checking");
  });

  it("does not need a token in claude.ai connector mode", () => {
    expect(mcpConnectionChip(linear({ mode: "claude", secrets: [{ name: "LINEAR_API_KEY", set: false }] }), undefined).state).toBe("not-tested");
  });

  it("names sign-in failures and folds every other failure into Not working", () => {
    const failed = (cause: "expired" | "signin" | "token" | "rate-limited") => ({
      ok: false as const,
      message: "x",
      problem: { cause },
    });
    expect(mcpConnectionChip(linear(), failed("expired"))).toMatchObject({ state: "expired", tone: "bad" });
    expect(mcpConnectionChip(linear(), failed("signin"))).toMatchObject({ state: "needs-sign-in", tone: "warn" });
    expect(mcpConnectionChip(linear(), failed("token"))).toMatchObject({ state: "not-working", tone: "bad" });
    expect(mcpConnectionChip(linear(), failed("rate-limited"))).toMatchObject({ state: "waiting", tone: "warn" });
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
    problem: { cause },
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

describe("googleSignInChip", () => {
  const status = (state: ConnectionStatus["state"]): ConnectionStatus => ({
    state,
    clientSaved: state !== "unconfigured",
    reason: undefined,
    projectId: undefined,
    account: undefined,
    email: undefined,
    signInError: undefined,
    signInsEnded: 0,
  });

  it("follows the sign-in, unless a failure says more", () => {
    expect(googleSignInChip(undefined, undefined).state).toBe("checking");
    expect(googleSignInChip(status("unconfigured"), undefined).state).toBe("not-set-up");
    expect(googleSignInChip(status("disconnected"), undefined).state).toBe("needs-sign-in");
    expect(googleSignInChip(status("connected"), undefined).state).toBe("connected");
    expect(googleSignInChip(status("connected"), { problem: { cause: "quota" } }).state).toBe("not-working");
    expect(googleSignInChip(status("connected"), { problem: { cause: "expired" } }).state).toBe("expired");
  });
});

describe("signInOutcome", () => {
  const status = (state: ConnectionStatus["state"], signInsEnded: number) => ({ state, signInsEnded });

  it("waits while the status still describes a sign-in from before this one", () => {
    expect(signInOutcome(2, status("connected", 2))).toBeUndefined();
    expect(signInOutcome(2, status("disconnected", 2))).toBeUndefined();
  });

  it("waits until it knows where the count stood when the sign-in began", () => {
    expect(signInOutcome(undefined, status("connected", 3))).toBeUndefined();
    expect(signInOutcome(2, undefined)).toBeUndefined();
  });

  it("ends once the sign-in is counted, connected or not", () => {
    expect(signInOutcome(2, status("connected", 3))).toBe("connected");
    expect(signInOutcome(2, status("disconnected", 3))).toBe("failed");
  });
});

describe("kakaoMacSteps", () => {
  it("marks nothing done until KakaoTalk is open to check", () => {
    const none = { appOpen: false, accessibility: false, automation: false, chatsTab: false };
    expect(kakaoMacSteps(undefined)).toEqual(none);
    expect(kakaoMacSteps({ state: "not-running" })).toEqual(none);
  });

  it("counts Automation as granted only when Accessibility was the one refused", () => {
    expect(kakaoMacSteps({ state: "no-access", missing: "accessibility", unread: undefined })).toEqual({
      appOpen: true,
      accessibility: false,
      automation: true,
      chatsTab: false,
    });
    expect(kakaoMacSteps({ state: "no-access", missing: "automation", unread: undefined })).toEqual({
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
    expect(kakaoMacChip({ state: "no-access", missing: "automation", unread: undefined })).toMatchObject({ state: "not-set-up", tone: "warn" });
  });
});

describe("switchReady", () => {
  it("lets a connector be tried at once, and the own server once its values are saved", () => {
    expect(switchReady(linear({ secrets: [{ name: "LINEAR_API_KEY", set: false }] }), "claude")).toBe(true);
    expect(switchReady(linear({ secrets: [{ name: "LINEAR_API_KEY", set: false }] }), "mcp")).toBe(false);
    expect(switchReady(linear(), "mcp")).toBe(true);
  });

  it("also needs a sign-in for a tool you sign in to in a browser", () => {
    const calendar = (signedIn: boolean, set = true) => linear({ id: "google_calendar", secrets: [{ name: "GOOGLE_OAUTH_CREDENTIALS", set }], signedIn });
    expect(switchReady(calendar(false), "mcp")).toBe(false);
    expect(switchReady(calendar(true, false), "mcp")).toBe(false);
    expect(switchReady(calendar(true), "mcp")).toBe(true);
  });
});

describe("modeFromFiles", () => {
  const on = { enabled: true };
  const off = { enabled: false };

  it("follows the sidebar widget's source when there is a widget", () => {
    expect(modeFromFiles({ widget: { via: "mcp", disabled: true }, server: on, hasConnector: true })).toBe("off");
    expect(modeFromFiles({ widget: { via: "claude-connector", disabled: false }, server: on, hasConnector: true })).toBe("claude");
    expect(modeFromFiles({ widget: { via: "mcp", disabled: false }, server: on, hasConnector: false })).toBe("mcp");
    expect(modeFromFiles({ widget: { via: "mcp", disabled: false }, server: off, hasConnector: true })).toBe("off");
  });

  it("falls back to the server switch, then a configured connector", () => {
    expect(modeFromFiles({ widget: undefined, server: on, hasConnector: true })).toBe("mcp");
    expect(modeFromFiles({ widget: undefined, server: off, hasConnector: true })).toBe("claude");
    expect(modeFromFiles({ widget: undefined, server: undefined, hasConnector: false })).toBe("off");
  });

  it("offers only the configured modes, and always off", () => {
    expect(availableModes({ widget: undefined, server: off, hasConnector: false })).toEqual(["mcp", "off"]);
    expect(availableModes({ widget: undefined, server: undefined, hasConnector: true })).toEqual(["claude", "off"]);
  });
});
