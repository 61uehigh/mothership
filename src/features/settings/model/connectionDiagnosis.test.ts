import { describe, expect, it } from "vitest";
import { describeSourceProblem, diagnoseConnection } from "@/features/settings/model/connectionDiagnosis";

const API_DISABLED =
  "google_calendar.list-events failed: MCP error -32600: Access denied: Google Calendar API has not been used in project 343781844477 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=343781844477 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.";

describe("diagnoseConnection: Google Calendar", () => {
  it("links the disabled Calendar API's page in the right project", () => {
    expect(diagnoseConnection("google_calendar", API_DISABLED)).toMatchObject({
      cause: "api-disabled",
      api: "Calendar API",
      url: "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=343781844477",
      project: "343781844477",
    });
  });

  it("builds the API page from the project when no link is given", () => {
    expect(diagnoseConnection("google_calendar", "accessNotConfigured: project 12345 has SERVICE_DISABLED")?.url).toBe(
      "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=12345",
    );
  });

  it("spots an expired or revoked sign-in", () => {
    const message =
      "google_calendar.list-events failed: MCP error -32600: Google rejected this account's stored credentials (invalid_grant): access was revoked or the refresh token expired. Use the manage-accounts tool with action 'list' to find the account marked 'needs-reauth', then run 'npx @cocal/google-calendar-mcp auth <account>'";
    expect(diagnoseConnection("google_calendar", message)).toEqual({ cause: "expired" });
    expect(diagnoseConnection("google_calendar", "Token has been expired or revoked.")?.cause).toBe("expired");
  });

  it("spots a missing sign-in", () => {
    expect(diagnoseConnection("google_calendar", "No valid tokens found. Run 'npx @cocal/google-calendar-mcp auth'.")?.cause).toBe("signin");
  });

  it("spots a refused OAuth client", () => {
    expect(diagnoseConnection("google_calendar", 'GaxiosError: invalid_client: "The OAuth client was not found."')?.cause).toBe("client");
    expect(diagnoseConnection("google_calendar", "Error 400: redirect_uri_mismatch")?.cause).toBe("client");
  });

  it("spots a used-up quota before calling it a rate limit", () => {
    expect(diagnoseConnection("google_calendar", "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' (rateLimitExceeded)")).toEqual({ cause: "quota", api: "Calendar API" });
  });
});

describe("diagnoseConnection: token tools", () => {
  it("links the Slack app's page when its MCP access is off, unescaping the JSON URL", () => {
    const message =
      'Could not connect to slack: Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"App is not enabled for Slack MCP server access. Please enable it here: https:\\/\\/api.slack.com\\/apps\\/A0CJGA87XLL\\/app-assistant"}}';
    expect(diagnoseConnection("slack", message)).toMatchObject({
      cause: "mcp-access",
      url: "https://api.slack.com/apps/A0CJGA87XLL/app-assistant",
    });
  });

  it("spots an invalid or revoked token", () => {
    expect(diagnoseConnection("linear", "Linear refused your API key. Replace it in Settings → Connections")?.cause).toBe("token");
    expect(diagnoseConnection("slack", "Slack refused your token. Replace it in Settings → Connections")?.cause).toBe("token");
    expect(diagnoseConnection("slack", "Your Slack token was revoked. Make a new one in your Slack app")?.cause).toBe("token");
    expect(diagnoseConnection("linear", "Linear refused LINEAR_API_KEY. Check that the key in .env.local is valid")).toEqual({ cause: "token" });
    expect(diagnoseConnection("slack", "Slack error: invalid_auth")?.cause).toBe("token");
    expect(diagnoseConnection("slack", "token_revoked")?.cause).toBe("token");
    expect(diagnoseConnection("notion", "API token is invalid.")?.cause).toBe("token");
    expect(diagnoseConnection("nuclino", "Streamable HTTP error: Error POSTing to endpoint (HTTP 401): Unauthorized")?.cause).toBe("token");
  });

  it("names the missing scope", () => {
    const problem = diagnoseConnection("slack", 'slack.slack_search_public_and_private failed: {"ok":false,"error":"missing_scope","needed":"search:read.public","provided":"chat:write"}');
    expect(problem).toEqual({ cause: "scope", variant: "slack", scope: "search:read.public", url: "https://api.slack.com/apps" });
  });

  it("explains a missing permission without a scope name", () => {
    expect(diagnoseConnection("notion", "Insufficient permissions for this endpoint. (restricted_resource)")).toEqual({ cause: "scope" });
  });

  it("tells the sidebar's own retrying rate limit, which comes coded, from the tool's", () => {
    expect(diagnoseConnection("nuclino", "anything", { code: "rate-limited" })).toEqual({ cause: "rate-limited", variant: "retrying" });
    expect(diagnoseConnection("nuclino", `{"status":"fail","message":"You've made too many requests and hit a rate limit"}`)).toEqual({ cause: "rate-limited" });
  });

  it("takes a code over whatever the message says", () => {
    expect(diagnoseConnection("slack", "invalid_auth", { code: "timed-out" })).toEqual({ cause: "network" });
  });

  it("points a claude.ai connector that is not connected to claude.ai's settings, naming the connector", () => {
    expect(diagnoseConnection("google_calendar", "Could not use the claude.ai Google Calendar connector.", { code: "connector-not-connected", connector: "Google Calendar" })).toEqual({
      cause: "connector",
      url: "https://claude.ai/settings/connectors",
      connector: "Google Calendar",
    });
  });

  it("spots network errors", () => {
    expect(diagnoseConnection("linear", "fetch failed: getaddrinfo ENOTFOUND mcp.linear.app")?.cause).toBe("network");
  });

  it("spots a server that can't start", () => {
    expect(diagnoseConnection("notion", "spawn npx ENOENT")).toEqual({ cause: "start" });
  });

  it("leaves unknown errors to the raw message", () => {
    expect(diagnoseConnection("linear", "Something odd happened")).toBeUndefined();
  });
});

describe("diagnoseConnection: YouTube Music", () => {
  it("links the disabled YouTube Data API in the right project", () => {
    const message =
      "YouTube Data API v3 has not been used in project 343781844477 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=343781844477 then retry.";
    expect(diagnoseConnection("youtube_music", message)).toMatchObject({
      cause: "api-disabled",
      api: "YouTube Data API v3",
      url: "https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=343781844477",
    });
    expect(diagnoseConnection("youtube_music", "accessNotConfigured in project 12345")?.url).toBe(
      "https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=12345",
    );
  });

  it("spots a client whose organisation turns other accounts away", () => {
    expect(diagnoseConnection("youtube_music", "Google did not finish the sign-in (access_denied: org_internal)")).toEqual({ cause: "org-internal" });
    expect(diagnoseConnection("youtube_music", "Error 403: org_internal")?.cause).toBe("org-internal");
  });

  it("spots a sign-in to an account without a YouTube channel", () => {
    expect(diagnoseConnection("youtube_music", "YouTube: Channel not found.")).toEqual({ cause: "no-channel" });
    expect(diagnoseConnection("slack", "channel_not_found")?.cause).not.toBe("no-channel");
  });

  it("spots an expired sign-in and the day's used-up quota", () => {
    expect(
      diagnoseConnection("youtube_music", "Google no longer accepts the YouTube sign-in: it expired or was revoked (invalid_grant: Token has been expired or revoked.)")?.cause,
    ).toBe("expired");
    expect(diagnoseConnection("youtube_music", "Google no longer accepts the YouTube sign-in: it expired or was revoked (Invalid Credentials)")?.cause).toBe("expired");
    expect(diagnoseConnection("youtube_music", "Today's YouTube Data API quota is used up; it resets at midnight Pacific time")).toMatchObject({ cause: "quota", variant: "youtube" });
  });
});

describe("diagnoseConnection: Gmail", () => {
  it("links the disabled Gmail API and spots a sign-in without mail access", () => {
    expect(diagnoseConnection("gmail", "Gmail API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=123 then retry.")).toMatchObject({
      cause: "api-disabled",
      api: "Gmail API",
      url: "https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=123",
    });
    expect(diagnoseConnection("gmail", "The Gmail sign-in lacks read access to your mail; sign in again and allow it (Request had insufficient authentication scopes.)")).toEqual({ cause: "scope", variant: "gmail" });
    expect(diagnoseConnection("gmail", "Google no longer accepts the Gmail sign-in: it expired or was revoked (invalid_grant: Token has been expired or revoked.)")?.cause).toBe("expired");
    expect(diagnoseConnection("gmail", "Google did not finish the sign-in (access_denied: org_internal)")?.cause).toBe("org-internal");
  });
});

describe("describeSourceProblem", () => {
  it("sends the calendar to the Google Calendar card", () => {
    expect(describeSourceProblem("calendar", "invalid_grant").card).toBe("google_calendar");
    expect(describeSourceProblem("calendar", "invalid_grant").problem?.cause).toBe("expired");
  });

  it("offers no fix for a source without a card", () => {
    expect(describeSourceProblem("github", "401 Unauthorized")).toEqual({ card: undefined, problem: undefined, fix: undefined });
    expect(describeSourceProblem(undefined, "401 Unauthorized").fix).toBeUndefined();
  });

  it("offers no fix for a rate limit, which passes on its own", () => {
    expect(describeSourceProblem("linear", "Linear is rate limiting requests", { code: "rate-limited" }).fix).toBeUndefined();
    expect(describeSourceProblem("linear", "429 Too Many Requests").fix).toBeUndefined();
  });

  it("offers no fix for a used-up Claude limit, which passes on its own", () => {
    expect(describeSourceProblem("calendar", "You've hit your limit", { code: "claude-limit" }).fix).toBeUndefined();
  });

  it("reads Claude's refused login by its code, not as the tool refusing its key", () => {
    expect(describeSourceProblem("calendar", "Invalid API key · Please run /login", { code: "claude-login" }).problem?.cause).toBe("claude-login");
  });

  it("sends Claude's refused login to Agents, where you log in again, not to the tool's card", () => {
    expect(describeSourceProblem("calendar", "Invalid API key · Please run /login", { code: "claude-login" }).fix).toEqual({ page: "agents" });
  });

  it("offers the fix for an unknown failure and for one without a message", () => {
    expect(describeSourceProblem("slack", "something odd")).toEqual({ card: "slack", problem: undefined, fix: { page: "connections", card: "slack" } });
    expect(describeSourceProblem("gmail", undefined).fix).toEqual({ page: "connections", card: "gmail" });
  });
});
