import { z } from "zod";
import type { GoogleSignInFailureCode } from "@/lib/apiErrorCodes";
import { inboxRulesSchema, type InboxRules } from "@/features/inbox/model/Inbox";
import { MEETING_COLLECTIONS_MAX, meetingCollectionSchema, type MeetingCollection } from "@/features/meetings/model/Meetings";
import type { ConnectionProblem } from "@/features/settings/model/connectionDiagnosis";
import type { ToolKind, UnavailableReason } from "@/features/tools/model/Dashboard";
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
 * ### CONNECTION_KINDS
 *
 * The sidebar section each connection feeds.
 */
export const CONNECTION_KINDS: Record<ConnectionId, ToolKind> = {
  google_calendar: "calendar",
  slack: "slack",
  linear: "linear",
  nuclino: "nuclino",
  notion: "notion",
};

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
] as const;

/**
 * ### SecretName
 *
 * One of {@link SECRET_NAMES}.
 */
export type SecretName = (typeof SECRET_NAMES)[number];

/**
 * ### SECRET_VALUE_MAX
 *
 * Longest token, key, or path a secret holds, in characters.
 */
export const SECRET_VALUE_MAX = 4096;

/**
 * ### SecretProblem
 *
 * What is wrong with a saved value: `file-missing` for a path to a file
 * that is gone (the Google OAuth client).
 */
export type SecretProblem = "file-missing";

/**
 * ### SecretState
 *
 * One `.env.local` variable as the Settings screen shows it.
 */
export type SecretState = {
  name: string;
  set: boolean;
  /** What is wrong with the saved value; never the value itself. */
  problem?: SecretProblem;
};

/**
 * ### CheckReason
 *
 * Why a {@link CheckResult} is or isn't ready:
 * - `api-key`: an agent runs on your API key.
 * - `login`: it uses your login (`account` names it when known).
 * - `login-expired`: the saved login was refused; log in again.
 * - `not-logged-in`: no login (and, for an agent, no API key).
 * - `not-installed`: the CLI is missing.
 * - `not-running`: Docker is installed but its daemon is down.
 * - `running`: Docker answers (`version` is the daemon's).
 * - `failed`: anything else; `error` is the tool's own text.
 */
export type CheckReason = "api-key" | "login" | "login-expired" | "not-logged-in" | "not-installed" | "not-running" | "running" | "failed";

/**
 * ### CheckResult
 *
 * Whether something mothership depends on is ready, as facts the browser words.
 */
export type CheckResult = {
  ready: boolean;
  reason: CheckReason;
  /** The account a login belongs to, such as an email or a GitHub username. */
  account?: string;
  version?: string;
  /** The tool's own message, for `failed`. */
  error?: string;
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
  /** For a tool you sign in to in a browser (Google Calendar): whether a sign-in is saved on this computer. */
  signedIn?: boolean;
  /** The sidebar's latest result for this tool, so the card shows a state without loading anything. */
  last?: ConnectionTest;
};

/**
 * ### AccountState
 *
 * Where a tool you sign in to outside MCP (YouTube Music, Gmail) stands:
 * - `unconfigured`: its key or OAuth client is not set, so it is not in use.
 * - `signed-out`: set up, but there is no sign-in.
 * - `expired`: the saved sign-in no longer works.
 * - `signed-in`: ready.
 */
export type AccountState = "unconfigured" | "signed-out" | "expired" | "signed-in";

/**
 * ### googleAccountState
 *
 * The {@link AccountState} of a tool with the app's own Google sign-in
 * (YouTube Music, Gmail), from its sign-in's state.
 */
export function googleAccountState(state: ConnectionStatus["state"]): AccountState {
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
 * ### gmailAccountState
 *
 * Gmail's {@link AccountState}. Gmail signs in with Google Calendar's OAuth
 * client, so a saved client says nothing about wanting Gmail: until you sign
 * in to Gmail it counts as not set up, not as signed out.
 */
export function gmailAccountState(state: ConnectionStatus["state"]): AccountState {
  return state === "disconnected" ? "unconfigured" : googleAccountState(state);
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
  accounts: { youtube_music: AccountState; gmail: AccountState };
  /** `.env.local` variables for the agents. */
  agentSecrets: Array<SecretState>;
  profile: { names: Array<string>; slackUserId: string | undefined };
  /** The IANA zone for the calendar and "today". */
  timezone: {
    /** The zone you chose in Settings; none means automatic. */
    chosen: string | undefined;
    /** The zone in use: your choice, else {@link automatic}. */
    effective: string;
    /** The zone used when none is chosen: `dashboard.yaml`'s, else this computer's, else UTC. */
    automatic: string;
  };
  /** Where a new session works when you leave its folder empty. */
  defaultFolder: {
    /** The folder you chose in Settings. */
    chosen: string | undefined;
    /** The folder used until you choose one. */
    fallback: string;
  };
  /** Who leads new sessions: your choice, else Claude. */
  lead: LeadChoice;
  /** Sessions stopped by an app restart continue on their own when mothership starts again. */
  autoContinue: boolean;
  /** Agents suggest your next prompt after a turn, shown in the reply box. */
  promptSuggestions: boolean;
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
 * ### SidebarState
 *
 * How the sidebar reads each tool today, as Settings needs to know it.
 */
export type SidebarState = {
  /** Each tool's widget by MCP server name; a tool without a widget is missing. */
  widgets: Partial<Record<ConnectionId, { via: "mcp" | "claude-connector"; disabled: boolean }>>;
  profile: SettingsView["profile"];
  /** The zone the sidebar uses, and the one it would use with none chosen. */
  timezone: { effective: string; automatic: string };
};

/**
 * ### connectionsNeedAttention
 *
 * Whether Settings → Connections carries a dot: a tool you turned on is
 * missing a token or a sign-in. A tool that is off, or (YouTube Music,
 * Gmail) never set up, is not in use and so needs nothing; a failed test
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
      /** The raw error, in full; absent when the sidebar can't reach the tool at all (see `unavailable`). */
      message?: string;
      /** What it means and what to do, when the error is a known one. */
      problem?: ConnectionProblem;
      /** Why the sidebar can't reach the tool, as facts the browser words. */
      unavailable?: UnavailableReason;
    };

/**
 * ### GoogleSignInState
 *
 * The Google sign-in Settings started for you:
 * - `idle`: none since the server started.
 * - `waiting`: the sign-in page is open in your browser; `url` opens it again.
 * - `done`: signed in.
 * - `failed`: it stopped; `code` says why, and `output` is the command's own
 *   last line or start error when there is one.
 */
export type GoogleSignInState =
  | { state: "idle" }
  | { state: "waiting"; url: string | undefined; startedAt: number }
  | { state: "done"; finishedAt: number }
  | { state: "failed"; code: GoogleSignInFailureCode; output?: string; exitCode?: number; finishedAt: number };

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
}, { message: "Not a known time zone", params: { code: "timezone-unknown" } });

/**
 * ### PROFILE_NAME_MIN
 *
 * The shortest name the profile keeps; shorter names would highlight too much
 * text as a mention.
 */
export const PROFILE_NAME_MIN = 2;

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
      names: z.array(z.string().trim().min(PROFILE_NAME_MIN)).optional(),
      slackUserId: z.union([z.literal(""), z.string().refine((id) => /^[UW][A-Z0-9]{6,}$/.test(id), { message: "A Slack member id looks like U0123456789", params: { code: "slack-member-id-invalid" } })]).optional(),
    })
    .optional(),
  /** Empty goes back to automatic: `dashboard.yaml`'s zone, else this computer's. */
  timezone: z.union([z.literal(""), timezoneSchema]).optional(),
  setupDone: z.boolean().optional(),
  /** Empty forgets it, so sessions fall back to your home folder. */
  defaultFolder: z.string().optional(),
  /** Who leads new sessions from now on. */
  lead: leadChoiceSchema.optional(),
  autoContinue: z.boolean().optional(),
  promptSuggestions: z.boolean().optional(),
  /** Rules to change; the rest are kept. */
  inbox: inboxRulesSchema.partial().optional(),
  /** Replaces the chosen meeting collections. */
  meetings: z.object({ collections: z.array(meetingCollectionSchema).max(MEETING_COLLECTIONS_MAX) }).optional(),
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

/**
 * ### SETUP_ACTIONS
 *
 * Setup steps Settings can ask the server to start, each a fixed command
 * there: the agents' and GitHub's logins, and starting Docker.
 */
export const SETUP_ACTIONS = ["claude-login", "codex-login", "gh-login", "docker-start"] as const;

/**
 * ### SetupAction
 *
 * One of {@link SETUP_ACTIONS}.
 */
export type SetupAction = (typeof SETUP_ACTIONS)[number];
