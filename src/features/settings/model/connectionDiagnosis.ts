import type { InboxSource } from "@/features/inbox/model/Inbox";
import type { AccountState } from "@/features/settings/model/Settings";
import type { ToolErrorFacts, WidgetKind } from "@/features/tools/model/Dashboard";
import type { ToolErrorCode } from "@/lib/apiErrorCodes";

/**
 * ### ConnectionCause
 *
 * A known reason a connection test failed:
 * - `api-disabled`: the Google API the tool uses (Calendar, YouTube Data, Gmail) is off in the OAuth client's Google Cloud project.
 * - `mcp-access`: the Slack app does not have Slack MCP server access turned on.
 * - `expired`: a saved Google sign-in expired (test mode lasts 7 days) or was revoked.
 * - `signin`: there is no Google sign-in yet.
 * - `client`: Google refused the OAuth client (not a Desktop app client, or deleted).
 * - `quota`: the Google Cloud project used up its API quota.
 * - `scope`: the token lacks a permission.
 * - `token`: the tool refused the token: invalid, revoked, or deactivated.
 * - `rate-limited`: the tool is refusing calls for a while.
 * - `network`: the tool could not be reached.
 * - `start`: the tool's MCP server could not start (e.g. no `npx` on `PATH`).
 * - `no-channel`: the Google account signed in to YouTube has no channel (usually the wrong account).
 * - `org-internal`: the OAuth client's project belongs to a Google Workspace organisation that only lets its own accounts sign in.
 * - `connector`: the claude.ai connector the tool is read through is not connected to the Claude account.
 * - `claude-login`: Claude refused the login the claude.ai connector is read through.
 * - `claude-limit`: a Claude usage or spend limit is used up, so the claude.ai connector can't be read until it resets.
 */
export type ConnectionCause =
  | "api-disabled"
  | "mcp-access"
  | "expired"
  | "signin"
  | "client"
  | "quota"
  | "scope"
  | "token"
  | "rate-limited"
  | "network"
  | "start"
  | "no-channel"
  | "org-internal"
  | "connector"
  | "claude-login"
  | "claude-limit";

/**
 * ### ProblemVariant
 *
 * Which wording of a cause applies, where one cause reads differently per tool or situation:
 * - `gmail`: a `scope` problem of the Gmail sign-in, which lacks mail access (not a token's scope).
 * - `slack`: a `scope` problem of a Slack token, fixed in the Slack app.
 * - `youtube`: a `quota` problem of the YouTube Data API, whose daily quota resets at midnight Pacific.
 * - `retrying`: a `rate-limited` problem the sidebar already retries on its own.
 */
export type ProblemVariant = "gmail" | "slack" | "youtube" | "retrying";

/**
 * ### ConnectionProblem
 *
 * What a failed test means, as facts only: the UI words it in the chosen
 * language (`problemSummary` and friends in `shell/connectionProblemText`),
 * so the server never sends sentences. The raw error stays in the test
 * result's `message`.
 */
export type ConnectionProblem = {
  cause: ConnectionCause;
  variant?: ProblemVariant;
  /** A page that fixes it, when there is one (e.g. the API's page in Google Cloud). */
  url?: string;
  /** The missing scope, when the error names it. */
  scope?: string;
  /** The Google API involved, e.g. `Calendar API`, for an `api-disabled` or `quota` problem. */
  api?: string;
  /** The Google Cloud project the error names, for an `api-disabled` problem. */
  project?: string;
  /** The claude.ai connector to connect, e.g. `Google Calendar`, for a `connector` problem. */
  connector?: string;
};

/**
 * ### KnownToolError
 *
 * What mothership already knows a failure is: its code and the facts that come with it.
 */
export type KnownToolError = Pick<ToolErrorFacts, "code" | "connector">;

/**
 * ### ConnectionTone
 *
 * How a connection's state reads at a glance, as the status chip colours it:
 * nothing to do, working, needs a step from you, broken.
 */
export type ConnectionTone = "neutral" | "good" | "warn" | "bad";

/** Failures that clear by waiting or by one step of yours, rather than a fix. */
const MILD_CAUSES: ReadonlySet<ConnectionCause> = new Set(["rate-limited", "quota", "signin", "no-channel", "connector", "claude-login", "claude-limit"]);

/**
 * ### problemTone
 *
 * The one colour for a failure cause, so the same failure reads the same on
 * every connection card.
 *
 * @param cause - The failure's cause; `undefined` for an error not recognised.
 * @returns `warn` when waiting or signing in clears it, `bad` otherwise (unknown errors included).
 */
export function problemTone(cause: ConnectionCause | undefined): "warn" | "bad" {
  return cause !== undefined && MILD_CAUSES.has(cause) ? "warn" : "bad";
}

/**
 * ### accountTone
 *
 * The colour for where a sign-in stands, matching the Settings dot: amber or
 * red exactly when `connectionsNeedAttention` counts it.
 */
export function accountTone(state: AccountState): ConnectionTone {
  switch (state) {
    case "unconfigured":
      return "neutral";
    case "signed-out":
      return "warn";
    case "expired":
      return "bad";
    case "signed-in":
      return "good";
  }
}

const TOOL_NAMES: Record<string, string> = {
  google_calendar: "Google Calendar",
  slack: "Slack",
  linear: "Linear",
  nuclino: "Nuclino",
  notion: "Notion",
  youtube_music: "YouTube Music",
  gmail: "Gmail",
};

/** The Google API each Google-signed-in tool uses: its name and its id in Google Cloud's API library. */
const GOOGLE_APIS: Record<string, { name: string; library: string }> = {
  google_calendar: { name: "Calendar API", library: "calendar-json.googleapis.com" },
  youtube_music: { name: "YouTube Data API v3", library: "youtube.googleapis.com" },
  gmail: { name: "Gmail API", library: "gmail.googleapis.com" },
};

// The same test as `RateLimitGate`; it codes the limits it catches, so this is for the ones it doesn't see.
const RATE_LIMITED = /rate.?limit|too many requests|\b429\b/i;

const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";

/**
 * What a failure mothership recognized itself means. A held rate limit is
 * one the sidebar retries on its own; a missed deadline reads as the tool
 * not being reachable.
 */
const CODED_PROBLEMS: Record<ToolErrorCode, ConnectionProblem> = {
  "rate-limited": { cause: "rate-limited", variant: "retrying" },
  "timed-out": { cause: "network" },
  "connector-not-connected": { cause: "connector", url: CLAUDE_CONNECTORS_URL },
  "claude-login": { cause: "claude-login" },
  "claude-limit": { cause: "claude-limit" },
};

/** Undoes JSON's `\/` escape in text pulled from a JSON error body. */
function unescapeJson(text: string): string {
  return text.replaceAll("\\/", "/");
}

/** Google's own link to the API page, or one built from the project number. */
function apiPage(message: string, library: string): { url: string; project: string | undefined } {
  const link = /https:\/\/console\.(?:developers|cloud)\.google\.com\/apis\/api\/[\w.-]+\/overview\?project=[\w-]+/.exec(message)?.[0];
  const project = /project[ =]["']?([\w-]+)/i.exec(message)?.[1];
  if (link !== undefined) return { url: link, project };
  return {
    url: `https://console.cloud.google.com/apis/library/${library}${project === undefined ? "" : `?project=${project}`}`,
    project,
  };
}

/** The scope an error names: Slack's `needed`, or a `scope:name`-looking word next to "scope". */
function missingScope(message: string): string | undefined {
  return (
    /needed["'\s:=]+([a-z]+:[a-z._:,]+)/i.exec(message)?.[1] ??
    /scopes?["'\s:=]+([a-z]+:[a-z._]+)/i.exec(message)?.[1] ??
    /([a-z]+:[a-z]+(?:\.[a-z]+)?) (?:scope|permission)/i.exec(message)?.[1]
  );
}

/**
 * ### connectionToolName
 *
 * The product name a connection's problems are worded with, e.g. `Linear` for `linear`.
 */
export function connectionToolName(id: string): string {
  return TOOL_NAMES[id] ?? id;
}

/**
 * ### diagnoseConnection
 *
 * Recognizes common failures of a connection test: from `code` when
 * mothership recognized the failure itself, else from the tool's raw error.
 *
 * @param id - The tool, by MCP server name (`google_calendar`, `slack`, …), or `youtube_music` / `gmail`.
 * @param raw - The raw error of the failed test; JSON-escaped text is unescaped first.
 * @param known - What mothership already knows the failure is, if anything.
 * @returns The cause and the facts to word it with, or `undefined` for an unknown error.
 */
export function diagnoseConnection(id: string, raw: string, known?: KnownToolError): ConnectionProblem | undefined {
  if (known?.code !== undefined) {
    const connector = known.code === "connector-not-connected" ? known.connector : undefined;
    return { ...CODED_PROBLEMS[known.code], ...(connector === undefined ? {} : { connector }) };
  }
  const message = unescapeJson(raw);
  const googleApi = GOOGLE_APIS[id];
  const google = googleApi !== undefined;

  if (/not enabled for Slack MCP server access/i.test(message)) {
    const url = /https:\/\/api\.slack\.com\/apps\/[A-Z0-9]+\/app-assistant/.exec(message)?.[0] ?? "https://api.slack.com/apps";
    return { cause: "mcp-access", url };
  }
  if (google && /has not been used in project|is disabled|accessNotConfigured|SERVICE_DISABLED|API has not been (used|enabled)/i.test(message)) {
    const { url, project } = apiPage(message, googleApi.library);
    return { cause: "api-disabled", url, api: googleApi.name, ...(project === undefined ? {} : { project }) };
  }
  if (google && /org_internal|only be used within its organi[sz]ation/i.test(message)) return { cause: "org-internal" };
  if (id === "youtube_music" && /channel ?not ?found|no YouTube channel/i.test(message)) return { cause: "no-channel" };
  if (id === "gmail" && /insufficient (authentication )?scopes?|lacks read access|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(message)) {
    return { cause: "scope", variant: "gmail" };
  }
  if (google && /invalid_client|unauthorized_client|deleted_client|redirect_uri_mismatch|Invalid credentials file|OAuth client was not found/i.test(message)) {
    return { cause: "client" };
  }
  if (google && /invalid_grant|needs-reauth|token has been expired or revoked|refresh token expired|revoked/i.test(message)) return { cause: "expired" };
  if (google && /no (valid )?tokens|not authenticated|google-calendar-mcp auth|authentication required|please authenticate/i.test(message)) {
    return { cause: "signin" };
  }
  if (google && /quota|rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED/i.test(message)) {
    return { cause: "quota", api: googleApi.name, ...(id === "youtube_music" ? { variant: "youtube" } : {}) };
  }
  if (/missing[_ ]scope|insufficient[_ ](scope|permission)|restricted_resource|not_allowed_token_type|does not have (the )?(required )?(scope|permission)/i.test(message)) {
    const scope = missingScope(message);
    return {
      cause: "scope",
      ...(id === "slack" ? { variant: "slack", url: "https://api.slack.com/apps" } : {}),
      ...(scope === undefined ? {} : { scope }),
    };
  }
  if (
    /\b401\b|unauthori[sz]ed|invalid_auth|not_authed|token_revoked|token_expired|account_inactive|invalid (api )?key|invalid token|api token is invalid|authentication failed|refused \w*(key|token)|refused your (api )?(key|token)|(token|key) was revoked|API token is invalid/i.test(
      message,
    )
  ) {
    return { cause: "token" };
  }
  if (RATE_LIMITED.test(message)) return { cause: "rate-limited" };
  if (/spawn \S+ ENOENT|command not found/i.test(message)) return { cause: "start" };
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|socket hang up|network ?error/i.test(message)) {
    return { cause: "network" };
  }
  return undefined;
}

/**
 * ### ProblemSource
 *
 * Where a failure shown outside Settings comes from: a sidebar widget or an Inbox source.
 */
export type ProblemSource = WidgetKind | InboxSource;

/** The Settings → Connections card that fixes each source's failures; agents, questions, and GitHub have none there. */
const SOURCE_CARDS: Record<ProblemSource, string | undefined> = {
  agent: undefined,
  agents: undefined,
  questions: undefined,
  github: undefined,
  calendar: "google_calendar",
  slack: "slack",
  linear: "linear",
  gmail: "gmail",
  nuclino: "nuclino",
  notion: "notion",
};

/**
 * ### SourceProblem
 *
 * What a view outside Settings needs to show a source's failure.
 */
export type SourceProblem = {
  /** The connection card to open, by connection id; `undefined` when no card fixes this source. */
  card: string | undefined;
  /** The diagnosed failure, or `undefined` for an unknown one (shown as its raw text). */
  problem: ConnectionProblem | undefined;
  /**
   * Where the fix is, if one is offered: Settings → Agents for Claude's refused
   * login (a tool read through claude.ai is fixed by logging in to Claude),
   * else the source's connection card. None without a card, or for a rate or
   * usage limit, which passes on its own.
   */
  fix: { page: "agents" } | { page: "connections"; card: string } | undefined;
};

/**
 * ### describeSourceProblem
 *
 * Which card fixes a source's failure, what the failure is, and whether to offer the fix.
 *
 * @param message - The raw error, or `undefined` when the source failed without one (e.g. it is not set up).
 * @param known - What mothership already knows the failure is, if anything.
 */
export function describeSourceProblem(source: ProblemSource | undefined, message: string | undefined, known?: KnownToolError): SourceProblem {
  const card = source === undefined ? undefined : SOURCE_CARDS[source];
  const problem = card === undefined || message === undefined ? undefined : diagnoseConnection(card, message, known);
  return { card, problem, fix: sourceFix(card, problem?.cause) };
}

function sourceFix(card: string | undefined, cause: ConnectionProblem["cause"] | undefined): SourceProblem["fix"] {
  if (card === undefined || cause === "rate-limited" || cause === "claude-limit") return undefined;
  return cause === "claude-login" ? { page: "agents" } : { page: "connections", card };
}
