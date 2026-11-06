import { z } from "zod";
import { inboxRulesSchema, type InboxRules } from "@/features/inbox/model/Inbox";
import { meetingCollectionSchema, type MeetingCollection } from "@/features/meetings/model/Meetings";
import type { KakaoStatus } from "@/features/kakaotalk/model/KakaoTalk";
import type { ConnectionProblem } from "@/features/settings/model/connectionDiagnosis";
import type { ConnectionStatus } from "@/features/youtube-music/model/YouTubeMusic";
import { leadChoiceSchema, type LeadChoice } from "@/features/sessions/model/Lead";

/**
 * ### CONNECTIONS
 *
 * Work tools mothership can connect to, by their `config/mcp.yaml` server name.
 */
export const CONNECTIONS = ["google_calendar", "slack", "linear", "nuclino", "notion"] as const;

/**
 * ### ConnectionId
 *
 * One of {@link CONNECTIONS}.
 */
export type ConnectionId = (typeof CONNECTIONS)[number];

/**
 * ### isConnectionId
 *
 * @returns Whether `name` (an MCP server name) is one of {@link CONNECTIONS}.
 */
export function isConnectionId(name: string): name is ConnectionId {
  return (CONNECTIONS as ReadonlyArray<string>).includes(name);
}

/**
 * ### ConnectionMode
 *
 * How mothership reaches a tool:
 * - `mcp`: the tool's own MCP server with your token (free, fast, all agents).
 * - `claude`: the claude.ai connector you connected in Claude (no token, Claude agents only,
 *   each sidebar refresh uses a little Claude usage).
 * - `off`: not used.
 */
export type ConnectionMode = "mcp" | "claude" | "off";

/**
 * ### SECRET_NAMES
 *
 * The `.env.local` variables the Settings screen may write. Values are never
 * sent back to the browser, only whether each one is set.
 */
export const SECRET_NAMES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "LINEAR_API_KEY",
  "NUCLINO_API_KEY",
  "NOTION_TOKEN",
  "SLACK_USER_TOKEN",
  "GOOGLE_OAUTH_CREDENTIALS",
  "YOUTUBE_OAUTH_CREDENTIALS",
  "KAKAO_REST_API_KEY",
  "KAKAO_CLIENT_SECRET",
] as const;

/**
 * ### SecretName
 *
 * One of {@link SECRET_NAMES}.
 */
export type SecretName = (typeof SECRET_NAMES)[number];

/**
 * ### SecretState
 *
 * One `.env.local` variable as the Settings screen shows it.
 */
export type SecretState = {
  name: string;
  set: boolean;
  /** What is wrong with the saved value, such as a file that is gone; never the value itself. */
  problem?: string;
};

/**
 * ### CheckResult
 *
 * Whether something mothership depends on is ready, with what to do if not.
 */
export type CheckResult = {
  ready: boolean;
  detail: string;
  /** What fixes it, when it isn't ready (or `login` to switch accounts): see {@link CheckFix}. */
  fix?: CheckFix;
};

/**
 * ### CheckFix
 *
 * The next step for something that isn't ready: install it, log in, or start it.
 */
export type CheckFix = "install" | "login" | "start";

/**
 * ### ConnectionView
 *
 * One tool connection as the Settings screen shows it.
 */
export type ConnectionView = {
  id: ConnectionId;
  /** The mode in effect: your choice in Settings, else what the config files say. */
  mode: ConnectionMode;
  /** Whether `mode` was chosen in Settings rather than read from the config files. */
  chosen: boolean;
  /** Modes this tool supports with the current config files. */
  modes: Array<ConnectionMode>;
  /** Variables the tool's MCP server needs. */
  secrets: Array<SecretState>;
  /** The claude.ai connector name used in `claude` mode. */
  connector: string | undefined;
  /** For a tool you sign in to in a browser (Google Calendar): whether a sign-in is saved on this Mac. */
  signedIn?: boolean;
  /** The sidebar's latest result for this tool, so the card shows a state without loading anything. */
  last?: ConnectionTest;
};

/**
 * ### AccountState
 *
 * Where a tool you sign in to outside MCP (KakaoTalk, YouTube Music) stands:
 * - `unconfigured`: its key or OAuth client is not set, so it is not in use.
 * - `signed-out`: set up, but there is no sign-in.
 * - `expired`: the saved sign-in no longer works.
 * - `signed-in`: ready.
 */
export type AccountState = "unconfigured" | "signed-out" | "expired" | "signed-in";

/**
 * ### kakaoAccountState
 *
 * KakaoTalk's {@link AccountState}. An expired Kakao sign-in reads as signed out,
 * since `KakaoStatus` does not tell the two apart.
 */
export function kakaoAccountState(memo: KakaoStatus["memo"]): AccountState {
  if (!memo.keySet) return "unconfigured";
  return memo.connected ? "signed-in" : "signed-out";
}

/**
 * ### youTubeAccountState
 *
 * YouTube Music's {@link AccountState}, from its sign-in's state.
 */
export function youTubeAccountState(state: ConnectionStatus["state"]): AccountState {
  switch (state) {
    case "unconfigured":
      return "unconfigured";
    case "disconnected":
      return "signed-out";
    case "expired":
      return "expired";
    case "connected":
      return "signed-in";
  }
}

/**
 * ### SettingsView
 *
 * Everything the Settings screen shows. Holds no secret values.
 */
export type SettingsView = {
  /** True on a fresh install that has not finished setup yet. */
  setupNeeded: boolean;
  /** Set when a custom MCP config (e.g. demo mode) is in use; connection choices are then ignored. */
  customConfig: string | undefined;
  agents: { claude: CheckResult; codex: CheckResult };
  tools: { github: CheckResult; docker: CheckResult };
  connections: Array<ConnectionView>;
  /** The tools with their own Settings card rather than a `ConnectionView`. */
  accounts: { kakaotalk: AccountState; youtube_music: AccountState };
  /** `.env.local` variables for the agents. */
  agentSecrets: Array<SecretState>;
  profile: { names: Array<string>; slackUserId: string | undefined; timezone: string };
  /** Where a new session works when you leave its folder empty. */
  defaultFolder: {
    /** The folder you chose in Settings. */
    chosen: string | undefined;
    /** The folder used until you choose one. */
    fallback: string;
  };
  /** Who leads new sessions: your choice, else Claude. */
  lead: LeadChoice;
  /** How the Inbox sorts items. */
  inbox: InboxRules;
  /** Nuclino collections the Meetings section lists notes from. */
  meetings: { collections: Array<MeetingCollection> };
  developer: {
    enabled: boolean;
    /** The mothership checkout feedback sessions work on: your choice, else the running checkout. */
    sourceFolder: string | undefined;
    /** Whether `sourceFolder` came from your choice rather than being detected. */
    chosen: boolean;
  };
};

/**
 * ### connectionsNeedAttention
 *
 * Whether Settings → Connections carries a dot: a tool you turned on is
 * missing a token or a sign-in. A tool that is off, or (KakaoTalk, YouTube
 * Music) never set up, is not in use and so needs nothing; a failed test
 * shows on its card only, since it may pass on the next try.
 */
export function connectionsNeedAttention(view: Pick<SettingsView, "connections" | "accounts">): boolean {
  const mcp = view.connections.some(
    (c) => c.mode === "mcp" && (c.secrets.some((secret) => !secret.set || secret.problem !== undefined) || c.signedIn === false),
  );
  return mcp || Object.values(view.accounts).some((state) => state === "signed-out" || state === "expired");
}

/**
 * ### ConnectionTest
 *
 * Result of trying a connection the way the sidebar uses it.
 */
export type ConnectionTest =
  | {
      ok: true;
      items: number;
      /** Who the token belongs to, e.g. `Ada · Acme` (Slack, Linear, Notion). */
      who?: string;
    }
  | {
      ok: false;
      /** The raw error, in full. */
      message: string;
      /** What it means and what to do, when the error is a known one. */
      problem?: ConnectionProblem;
    };

/**
 * ### GoogleSignInState
 *
 * The Google sign-in Settings started for you:
 * - `idle`: none since the server started.
 * - `waiting`: the sign-in page is open in your browser; `url` opens it again.
 * - `done`: signed in.
 * - `failed`: it stopped; `message` says why.
 */
export type GoogleSignInState =
  | { state: "idle" }
  | { state: "waiting"; url: string | undefined; startedAt: number }
  | { state: "done"; finishedAt: number }
  | { state: "failed"; message: string; finishedAt: number };

/**
 * ### OAUTH_CLIENT_MAX_BYTES
 *
 * The largest OAuth client file Settings accepts; a real one is under 1 KB.
 */
export const OAUTH_CLIENT_MAX_BYTES = 64 * 1024;

/**
 * ### SETTINGS_PAGES
 *
 * Settings' pages, in the order of its side menu.
 */
export const SETTINGS_PAGES = ["general", "profile", "agents", "connections", "workspace", "advanced"] as const;

/**
 * ### SettingsPageId
 *
 * One of {@link SETTINGS_PAGES}.
 */
export type SettingsPageId = (typeof SETTINGS_PAGES)[number];

const timezoneSchema = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, "Not a known time zone");

/**
 * ### settingsPatchSchema
 *
 * A change to the saved settings, as `PATCH /api/settings` takes it. Fields
 * left out are kept; an empty string clears a text field; a connection's
 * `default` forgets your choice so the config files decide again. The route
 * adds the folder checks, which need the file system.
 */
export const settingsPatchSchema = z.object({
  connections: z.partialRecord(z.enum(CONNECTIONS), z.enum(["mcp", "claude", "off", "default"])).optional(),
  profile: z
    .object({
      names: z.array(z.string().trim().min(2)).optional(),
      slackUserId: z.union([z.literal(""), z.string().regex(/^[UW][A-Z0-9]{6,}$/, "A Slack member id looks like U0123456789")]).optional(),
      timezone: z.union([z.literal(""), timezoneSchema]).optional(),
    })
    .optional(),
  setupDone: z.boolean().optional(),
  /** Empty forgets it, so sessions fall back to your home folder. */
  defaultFolder: z.string().optional(),
  /** Who leads new sessions from now on. */
  lead: leadChoiceSchema.optional(),
  /** Rules to change; the rest are kept. */
  inbox: inboxRulesSchema.partial().optional(),
  /** Replaces the chosen meeting collections. */
  meetings: z.object({ collections: z.array(meetingCollectionSchema).max(20) }).optional(),
  developer: z
    .object({
      enabled: z.boolean().optional(),
      /** Empty forgets it, so the running checkout is used when there is one. */
      sourceFolder: z.string().optional(),
    })
    .optional(),
});

/**
 * ### SettingsPatch
 *
 * See {@link settingsPatchSchema}.
 */
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
