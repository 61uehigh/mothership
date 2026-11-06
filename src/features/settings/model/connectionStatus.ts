import type { KakaoChats } from "@/features/kakaotalk/model/KakaoTalk";
import type { ConnectionStatus } from "@/features/youtube-music/model/YouTubeMusic";
import { accountTone, problemTone, type ConnectionProblem, type ConnectionTone } from "@/features/settings/model/connectionDiagnosis";
import type { ConnectionMode, ConnectionTest, ConnectionView } from "@/features/settings/model/Settings";

/**
 * ### ChipState
 *
 * The few states a connection's status chip can name, the same words on
 * every card. A failed test's own cause shows on the failure line, not the chip.
 */
export type ChipState = "checking" | "off" | "not-set-up" | "needs-sign-in" | "expired" | "not-tested" | "connected" | "not-working" | "waiting";

/**
 * ### ConnectionChip
 *
 * What a status chip shows; the UI words `state` (`chipLabel`).
 */
export type ConnectionChip = { state: ChipState; tone: ConnectionTone };

function chip(state: ChipState, tone: ConnectionTone): ConnectionChip {
  return { state, tone };
}

/** A failed test as a chip: a sign-in problem names it, any other failure is "Not working". */
function failureChip(problem: ConnectionProblem | undefined): ConnectionChip {
  if (problem?.cause === "expired") return chip("expired", accountTone("expired"));
  if (problem?.cause === "signin") return chip("needs-sign-in", accountTone("signed-out"));
  // The service asked to slow down; nothing is broken and it clears on its own.
  if (problem?.cause === "rate-limited") return chip("waiting", "warn");
  return chip("not-working", problemTone(problem?.cause));
}

/**
 * ### ConnectionFiles
 *
 * What the config files say about one tool, as its mode is decided from them.
 */
export type ConnectionFiles = {
  /** The tool's sidebar widget, when it has one. */
  widget: { via: "mcp" | "claude-connector"; disabled: boolean } | undefined;
  /** Its entry in the MCP config, when it has one. */
  server: { enabled: boolean } | undefined;
  /** A claude.ai connector is configured for it. */
  hasConnector: boolean;
};

/**
 * ### modeFromFiles
 *
 * The mode a tool is in when you have not chosen one in Settings: the
 * sidebar widget's source decides, else the MCP server switch, else a
 * configured claude.ai connector.
 */
export function modeFromFiles({ widget, server, hasConnector }: ConnectionFiles): ConnectionMode {
  const serverOn = server?.enabled === true;
  if (widget !== undefined) {
    if (widget.disabled) return "off";
    if (widget.via === "claude-connector") return "claude";
    return serverOn ? "mcp" : "off";
  }
  if (serverOn) return "mcp";
  return hasConnector ? "claude" : "off";
}

/**
 * ### availableModes
 *
 * The modes a tool can be switched to: its MCP server and its connector
 * where configured, and always off.
 */
export function availableModes({ server, hasConnector }: ConnectionFiles): Array<ConnectionMode> {
  return [...(server === undefined ? [] : ["mcp" as const]), ...(hasConnector ? ["claude" as const] : []), "off"];
}

/**
 * ### tokenMissing
 *
 * Whether a tool in token mode lacks a value its MCP server needs (or the
 * saved one is unusable), so its setup is not finished.
 */
export function tokenMissing(connection: ConnectionView): boolean {
  return connection.mode === "mcp" && connection.secrets.some((s) => !s.set || s.problem !== undefined);
}

/**
 * ### mcpConnectionChip
 *
 * The chip of an MCP tool's card, from its setup and the latest test.
 * Without a token or Google sign-in the setup comes first, so a stale test
 * result is ignored.
 *
 * @param test - Your latest test, else the sidebar's last result; `undefined` when there is none.
 * @param testing - A test is running now.
 */
export function mcpConnectionChip(connection: ConnectionView, test: ConnectionTest | undefined, testing = false): ConnectionChip {
  if (connection.mode === "off") return chip("off", "neutral");
  if (tokenMissing(connection)) return chip("not-set-up", "warn");
  if (connection.mode === "mcp" && connection.signedIn === false) return chip("needs-sign-in", accountTone("signed-out"));
  if (testing) return chip("checking", "neutral");
  if (test === undefined) return chip("not-tested", "neutral");
  return test.ok ? chip("connected", "good") : failureChip(test.problem);
}

/**
 * ### switchReady
 *
 * Whether a working connection can be tried in `target` mode: a connector
 * needs nothing here, the tool's own server needs its values saved and,
 * for a tool you sign in to in a browser, a sign-in.
 */
export function switchReady(connection: ConnectionView, target: ConnectionMode): boolean {
  if (target === "claude") return true;
  if (target === "off") return false;
  const valuesSaved = connection.secrets.every((s) => s.set && s.problem === undefined);
  return valuesSaved && connection.signedIn !== false;
}

/**
 * ### isMcpDisconnected
 *
 * Whether the connection is off or needs to be set up or authorized again.
 * An untested connection or a temporary service failure still allows configuration.
 */
export function isMcpDisconnected(connection: ConnectionView): boolean {
  const state = mcpConnectionChip(connection, connection.last).state;
  return state === "off" || state === "not-set-up" || state === "needs-sign-in" || state === "expired"
    || (connection.last?.ok === false && connection.last.problem?.cause === "token");
}

/**
 * ### googleSignInChip
 *
 * The chip of a tool with the app's own Google sign-in (YouTube Music,
 * Gmail): where its sign-in stands, unless the latest test or sign-in failed.
 *
 * @param failure - The latest test's or sign-in's failure, if any.
 */
export function googleSignInChip(status: Pick<ConnectionStatus, "state"> | undefined, failure: { problem: ConnectionProblem | undefined } | undefined): ConnectionChip {
  if (status === undefined) return chip("checking", "neutral");
  if (status.state === "unconfigured") return chip("not-set-up", accountTone("unconfigured"));
  if (status.state === "expired") return chip("expired", accountTone("expired"));
  if (failure !== undefined) return failureChip(failure.problem);
  if (status.state === "disconnected") return chip("needs-sign-in", accountTone("signed-out"));
  return chip("connected", accountTone("signed-in"));
}

/**
 * ### signInOutcome
 *
 * How a sign-in a card opened in your browser ended, judged only by a status
 * that counts it as ended: until then the status still describes the sign-in
 * before it (signed in, or the last attempt's error), so it says nothing yet.
 *
 * @param endedAtStart - `signInsEnded` as it stood when the sign-in began; `undefined` while unknown.
 * @param now - The latest status.
 * @returns `undefined` while the sign-in has not ended.
 */
export function signInOutcome(
  endedAtStart: number | undefined,
  now: Pick<ConnectionStatus, "state" | "signInsEnded"> | undefined,
): "connected" | "failed" | undefined {
  if (endedAtStart === undefined || now === undefined || now.signInsEnded === endedAtStart) return undefined;
  return now.state === "connected" ? "connected" : "failed";
}

/**
 * ### KakaoMacSteps
 *
 * Which of the steps for reading chats on a Mac are done. A permission
 * reads as not done while it cannot be checked yet.
 */
export type KakaoMacSteps = { appOpen: boolean; accessibility: boolean; automation: boolean; chatsTab: boolean };

/**
 * ### kakaoMacSteps
 *
 * What reading the KakaoTalk window says about each step. The script asks
 * System Events first (Automation), then reads the window (Accessibility),
 * so a missing Accessibility permission means Automation was granted, but a
 * missing Automation permission says nothing about Accessibility.
 *
 * @param chats - The latest read of the chat list; `undefined` while reading.
 */
export function kakaoMacSteps(chats: KakaoChats | undefined): KakaoMacSteps {
  const none = { appOpen: false, accessibility: false, automation: false, chatsTab: false };
  if (chats === undefined) return none;
  switch (chats.state) {
    case "unsupported":
    case "not-running":
      return none;
    case "no-access":
      return { appOpen: true, accessibility: false, automation: chats.missing === "accessibility", chatsTab: false };
    case "no-list":
      return { appOpen: true, accessibility: true, automation: true, chatsTab: false };
    case "ok":
      return { appOpen: true, accessibility: true, automation: true, chatsTab: true };
  }
}

/**
 * ### kakaoMacChip
 *
 * The chip of KakaoTalk's read-chats row.
 */
export function kakaoMacChip(chats: KakaoChats | undefined): ConnectionChip {
  if (chats === undefined) return chip("checking", "neutral");
  if (chats.state === "ok") return chip("connected", "good");
  return chip("not-set-up", chats.state === "no-access" ? "warn" : "neutral");
}
