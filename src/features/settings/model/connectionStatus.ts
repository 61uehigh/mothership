import type { KakaoChats, KakaoStatus } from "@/features/kakaotalk/model/KakaoTalk";
import type { ConnectionStatus } from "@/features/youtube-music/model/YouTubeMusic";
import { accountTone, problemTone, type ConnectionProblem, type ConnectionTone } from "@/features/settings/model/connectionDiagnosis";
import type { ConnectionTest, ConnectionView } from "@/features/settings/model/Settings";

/**
 * ### ChipState
 *
 * The few states a connection's status chip can name, the same words on
 * every card. A failed test's own cause shows on the failure line, not the chip.
 */
export type ChipState = "checking" | "off" | "not-set-up" | "needs-sign-in" | "expired" | "not-tested" | "connected" | "not-working";

/**
 * ### CHIP_LABELS
 *
 * The chip's words for each {@link ChipState}.
 */
export const CHIP_LABELS: Record<ChipState, string> = {
  checking: "Checking…",
  off: "Off",
  "not-set-up": "Not set up",
  "needs-sign-in": "Needs sign-in",
  expired: "Sign-in expired",
  "not-tested": "Not tested",
  connected: "Connected",
  "not-working": "Not working",
};

/**
 * ### ConnectionChip
 *
 * What a status chip shows.
 */
export type ConnectionChip = { state: ChipState; label: string; tone: ConnectionTone };

function chip(state: ChipState, tone: ConnectionTone): ConnectionChip {
  return { state, label: CHIP_LABELS[state], tone };
}

/** A failed test as a chip: a sign-in problem names it, any other failure is "Not working". */
function failureChip(problem: ConnectionProblem | undefined): ConnectionChip {
  if (problem?.cause === "expired") return chip("expired", accountTone("expired"));
  if (problem?.cause === "signin") return chip("needs-sign-in", accountTone("signed-out"));
  return chip("not-working", problemTone(problem?.cause));
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
 */
export function mcpConnectionChip(connection: ConnectionView, test: ConnectionTest | undefined): ConnectionChip {
  if (connection.mode === "off") return chip("off", "neutral");
  if (tokenMissing(connection)) return chip("not-set-up", "warn");
  if (connection.mode === "mcp" && connection.id === "google_calendar" && connection.signedIn === false) return chip("needs-sign-in", accountTone("signed-out"));
  if (test === undefined) return chip("not-tested", "neutral");
  return test.ok ? chip("connected", "good") : failureChip(test.problem);
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
 * ### youTubeChip
 *
 * YouTube Music's chip: where its sign-in stands, unless the latest test or
 * sign-in failed.
 *
 * @param failure - The latest test's or sign-in's failure, if any.
 */
export function youTubeChip(status: ConnectionStatus | undefined, failure: { problem: ConnectionProblem | undefined } | undefined): ConnectionChip {
  if (status === undefined) return chip("checking", "neutral");
  if (status.state === "unconfigured") return chip("not-set-up", accountTone("unconfigured"));
  if (status.state === "expired") return chip("expired", accountTone("expired"));
  if (failure !== undefined) return failureChip(failure.problem);
  if (status.state === "disconnected") return chip("needs-sign-in", accountTone("signed-out"));
  return chip("connected", accountTone("signed-in"));
}

/**
 * ### kakaoMemoChip
 *
 * The chip of KakaoTalk's note-to-self row. An expired Kakao sign-in reads
 * as signed out, since `KakaoStatus` does not tell the two apart.
 */
export function kakaoMemoChip(memo: KakaoStatus["memo"] | undefined): ConnectionChip {
  if (memo === undefined) return chip("checking", "neutral");
  if (!memo.keySet) return chip("not-set-up", accountTone("unconfigured"));
  return memo.connected ? chip("connected", accountTone("signed-in")) : chip("needs-sign-in", accountTone("signed-out"));
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
