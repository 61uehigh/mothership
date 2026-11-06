import type { AccountState } from "@/features/settings/model/Settings";

/**
 * ### ConnectionCause
 *
 * A known reason a connection test failed:
 * - `api-disabled`: the Google API the tool uses (Calendar, YouTube Data) is off in the OAuth client's Google Cloud project.
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
  | "org-internal";

/**
 * ### ConnectionProblem
 *
 * What a failed test means and what to do about it. The raw error stays in
 * the test result's `message`.
 */
export type ConnectionProblem = {
  cause: ConnectionCause;
  /** A few words for the status chip, e.g. `API not enabled`. */
  label: string;
  /** One short line: what is wrong and what to do. */
  summary: string;
  /** More about the cause, shown under Details with the raw error. */
  detail?: string;
  /** A page that fixes it, when there is one (e.g. the API's page in Google Cloud). */
  url?: string;
  /** The missing scope, when the error names it. */
  scope?: string;
  /** The Google API to enable, e.g. `Calendar API`, for an `api-disabled` problem. */
  api?: string;
};

/**
 * ### ConnectionTone
 *
 * How a connection's state reads at a glance, as the status chip colours it:
 * nothing to do, working, needs a step from you, broken.
 */
export type ConnectionTone = "neutral" | "good" | "warn" | "bad";

/** Failures that clear by waiting or by one step of yours, rather than a fix. */
const MILD_CAUSES: ReadonlySet<ConnectionCause> = new Set(["rate-limited", "quota", "signin", "no-channel"]);

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
};

/** The Google API each Google-signed-in tool uses: its name and its id in Google Cloud's API library. */
const GOOGLE_APIS: Record<string, { name: string; library: string }> = {
  google_calendar: { name: "Calendar API", library: "calendar-json.googleapis.com" },
  youtube_music: { name: "YouTube Data API v3", library: "youtube.googleapis.com" },
};

// The same test as `RateLimitGate`, which turns these into "<Tool> is rate limiting requests; retrying in Ns.".
const RATE_LIMITED = /rate.?limit|too many requests|\b429\b/i;
const GATE_WORDING = /^\w[\w ]* is rate limiting requests; retrying in \d+s\.$/;

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
 * ### diagnoseConnection
 *
 * Recognizes common failures of a connection test from the raw error.
 *
 * @param id - The tool, by MCP server name (`google_calendar`, `slack`, …), or `youtube_music`.
 * @param raw - The raw error of the failed test; JSON-escaped text is unescaped first.
 * @returns What it means and what to do, or `undefined` for an unknown error.
 */
export function diagnoseConnection(id: string, raw: string): ConnectionProblem | undefined {
  const message = unescapeJson(raw);
  const tool = TOOL_NAMES[id] ?? id;
  const googleApi = GOOGLE_APIS[id];
  const google = googleApi !== undefined;

  if (/not enabled for Slack MCP server access/i.test(message)) {
    const url =
      /https:\/\/api\.slack\.com\/apps\/[A-Z0-9]+\/app-assistant/.exec(message)?.[0] ?? "https://api.slack.com/apps";
    return {
      cause: "mcp-access",
      label: "MCP access off",
      summary: "Turn on MCP server access for your Slack app.",
      detail: "In your Slack app: Agents → Model Context Protocol.",
      url,
    };
  }
  if (google && /has not been used in project|is disabled|accessNotConfigured|SERVICE_DISABLED|API has not been (used|enabled)/i.test(message)) {
    const { url, project } = apiPage(message, googleApi.library);
    return {
      cause: "api-disabled",
      label: "API not enabled",
      summary: `Turn on the ${googleApi.name} in Google Cloud.`,
      detail: `It is off in your Google Cloud project${project === undefined ? "" : ` (${project})`}. Turning it on can take a few minutes to apply.`,
      url,
      api: googleApi.name,
    };
  }
  if (google && /org_internal|only be used within its organi[sz]ation/i.test(message)) {
    return {
      cause: "org-internal",
      label: "Organisation only",
      summary: "This OAuth client only lets its organisation's accounts in.",
      detail: "It belongs to a Google Workspace organisation. Use a client from a project under the account you sign in with.",
    };
  }
  if (id === "youtube_music" && /channel ?not ?found|no YouTube channel/i.test(message)) {
    return {
      cause: "no-channel",
      label: "No YouTube channel",
      summary: "This Google account has no YouTube channel. Sign in with another.",
      detail:
        "YouTube lists no playlists for an account without a channel. Choose the account you use YouTube Music with (add it as a test user of the OAuth client's Google Cloud project first).",
    };
  }
  if (google && /invalid_client|unauthorized_client|deleted_client|redirect_uri_mismatch|Invalid credentials file|OAuth client was not found/i.test(message)) {
    return {
      cause: "client",
      label: "Wrong OAuth client",
      summary: "Google refused the OAuth client. Use a Desktop app client.",
      detail: "Create an OAuth client of type Desktop app, choose its file again, and sign in again.",
    };
  }
  if (google && /invalid_grant|needs-reauth|token has been expired or revoked|refresh token expired|revoked/i.test(message)) {
    return {
      cause: "expired",
      label: "Sign-in expired",
      summary: "Your Google sign-in expired. Sign in again.",
      detail: "Google ends test-mode sign-ins after 7 days, or the sign-in was revoked.",
    };
  }
  if (google && /no (valid )?tokens|not authenticated|google-calendar-mcp auth|authentication required|please authenticate/i.test(message)) {
    return { cause: "signin", label: "Needs sign-in", summary: "No Google sign-in on this Mac yet. Sign in with Google." };
  }
  if (google && /quota|rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED/i.test(message)) {
    return {
      cause: "quota",
      label: "Quota reached",
      summary: id === "youtube_music" ? "Today's YouTube quota is used up. It resets at midnight Pacific." : `The ${googleApi.name} quota is used up. Check again later.`,
      detail:
        id === "youtube_music"
          ? "The YouTube Data API allows 10,000 units a day; a search costs 100."
          : `Your Google Cloud project used up its ${googleApi.name} quota for now.`,
    };
  }
  if (/missing[_ ]scope|insufficient[_ ](scope|permission)|restricted_resource|not_allowed_token_type|does not have (the )?(required )?(scope|permission)/i.test(message)) {
    const scope = missingScope(message);
    const named = scope === undefined ? "a permission this needs" : `the ${scope} scope`;
    return {
      cause: "scope",
      label: "Missing permission",
      summary: `The token lacks ${named}.`,
      detail:
        id === "slack"
          ? "Add it in your Slack app's OAuth & Permissions, reinstall the app, and replace the token with the new one."
          : "Give the token that permission (or make a new one) and replace it.",
      ...(id === "slack" ? { url: "https://api.slack.com/apps" } : {}),
      ...(scope === undefined ? {} : { scope }),
    };
  }
  if (
    /\b401\b|unauthori[sz]ed|invalid_auth|not_authed|token_revoked|token_expired|account_inactive|invalid (api )?key|invalid token|api token is invalid|authentication failed|refused \w*(key|token)|API token is invalid/i.test(
      message,
    )
  ) {
    return { cause: "token", label: "Token invalid", summary: `${tool} refused the token. Replace it with a new one.`, detail: "The token is wrong, revoked, or expired." };
  }
  if (RATE_LIMITED.test(message)) {
    return {
      cause: "rate-limited",
      label: "Rate limited",
      summary: GATE_WORDING.test(message.trim()) ? message.trim() : `${tool} is rate limiting requests. Check again in a minute.`,
    };
  }
  if (/spawn \S+ ENOENT|command not found/i.test(message)) {
    return { cause: "start", label: "Can't start", summary: `${tool}'s MCP server couldn't start.`, detail: "A program it needs (such as npx from Node.js) was not found." };
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|socket hang up|network ?error|No response within/i.test(message)) {
    return { cause: "network", label: "Can't reach", summary: `Couldn't reach ${tool}. Check your connection or VPN.` };
  }
  return undefined;
}
