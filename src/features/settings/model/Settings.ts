/**
 * ### CONNECTIONS
 *
 * Work tools mothership can connect to, by their `config/mcp.yaml` server name.
 */
export const CONNECTIONS = ["google_calendar", "slack", "linear", "nuclino"] as const;

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
  "SLACK_USER_TOKEN",
  "GOOGLE_OAUTH_CREDENTIALS",
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
export type SecretState = { name: string; set: boolean };

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
};

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
  agents: { claude: CheckResult; openai: CheckResult; codex: CheckResult };
  tools: { github: CheckResult; docker: CheckResult };
  connections: Array<ConnectionView>;
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
};

/**
 * ### ConnectionTest
 *
 * Result of trying a connection the way the sidebar uses it.
 */
export type ConnectionTest = { ok: true; items: number } | { ok: false; message: string };
