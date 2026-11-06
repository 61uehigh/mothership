import { describe, expect, it } from "vitest";
import { accountTone, diagnoseConnection, problemTone } from "@/features/settings/model/connectionDiagnosis";

const API_DISABLED =
  "google_calendar.list-events failed: MCP error -32600: Access denied: Google Calendar API has not been used in project 343781844477 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=343781844477 then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.";

describe("diagnoseConnection: Google Calendar", () => {
  it("links the disabled Calendar API's page in the right project", () => {
    expect(diagnoseConnection("google_calendar", API_DISABLED)).toMatchObject({
      cause: "api-disabled",
      label: "API not enabled",
      url: "https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=343781844477",
      detail: expect.stringContaining("343781844477"),
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
    expect(diagnoseConnection("google_calendar", message)).toMatchObject({ cause: "expired", label: "Sign-in expired" });
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
    expect(diagnoseConnection("google_calendar", "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' (rateLimitExceeded)")).toMatchObject({
      cause: "quota",
      label: "Quota reached",
    });
  });
});

describe("diagnoseConnection: token tools", () => {
  it("links the Slack app's page when its MCP access is off, unescaping the JSON URL", () => {
    const message =
      'Could not connect to slack: Streamable HTTP error: Error POSTing to endpoint: {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"App is not enabled for Slack MCP server access. Please enable it here: https:\\/\\/api.slack.com\\/apps\\/A0CJGA87XLL\\/app-assistant"}}';
    expect(diagnoseConnection("slack", message)).toMatchObject({
      cause: "mcp-access",
      label: "MCP access off",
      url: "https://api.slack.com/apps/A0CJGA87XLL/app-assistant",
    });
  });

  it("spots an invalid or revoked token", () => {
    expect(diagnoseConnection("linear", "Linear refused LINEAR_API_KEY. Check that the key in .env.local is valid")).toMatchObject({
      cause: "token",
      label: "Token invalid",
      summary: expect.stringContaining("Linear"),
    });
    expect(diagnoseConnection("slack", "Slack error: invalid_auth")?.cause).toBe("token");
    expect(diagnoseConnection("slack", "token_revoked")?.cause).toBe("token");
    expect(diagnoseConnection("notion", "API token is invalid.")?.cause).toBe("token");
    expect(diagnoseConnection("nuclino", "Streamable HTTP error: Error POSTing to endpoint (HTTP 401): Unauthorized")?.cause).toBe("token");
  });

  it("names the missing scope", () => {
    const problem = diagnoseConnection("slack", 'slack.slack_search_public_and_private failed: {"ok":false,"error":"missing_scope","needed":"search:read.public","provided":"chat:write"}');
    expect(problem).toMatchObject({ cause: "scope", label: "Missing permission", scope: "search:read.public", url: "https://api.slack.com/apps" });
    expect(problem?.summary).toContain("search:read.public");
  });

  it("explains a missing permission without a scope name", () => {
    expect(diagnoseConnection("notion", "Insufficient permissions for this endpoint. (restricted_resource)")).toMatchObject({ cause: "scope", label: "Missing permission" });
  });

  it("keeps the rate limit wording the sidebar uses", () => {
    expect(diagnoseConnection("nuclino", "Nuclino is rate limiting requests; retrying in 30s.")).toMatchObject({
      cause: "rate-limited",
      summary: "Nuclino is rate limiting requests; retrying in 30s.",
    });
    expect(diagnoseConnection("nuclino", `{"status":"fail","message":"You've made too many requests and hit a rate limit"}`)?.summary).toBe(
      "Nuclino is rate limiting requests. Check again in a minute.",
    );
  });

  it("spots network errors", () => {
    expect(diagnoseConnection("linear", "fetch failed: getaddrinfo ENOTFOUND mcp.linear.app")?.cause).toBe("network");
    expect(diagnoseConnection("slack", "No response within 20 seconds")?.cause).toBe("network");
  });

  it("spots a server that can't start", () => {
    expect(diagnoseConnection("notion", "spawn npx ENOENT")).toMatchObject({ cause: "start", label: "Can't start" });
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
      summary: expect.stringContaining("YouTube Data API v3"),
    });
    expect(diagnoseConnection("youtube_music", "accessNotConfigured in project 12345")?.url).toBe(
      "https://console.cloud.google.com/apis/library/youtube.googleapis.com?project=12345",
    );
  });

  it("spots a client whose organisation turns other accounts away", () => {
    expect(diagnoseConnection("youtube_music", "Google did not finish the sign-in (access_denied: org_internal)")).toMatchObject({
      cause: "org-internal",
      label: "Organisation only",
      detail: expect.stringContaining("Google Workspace organisation"),
    });
    expect(diagnoseConnection("youtube_music", "Error 403: org_internal")?.cause).toBe("org-internal");
  });

  it("spots a sign-in to an account without a YouTube channel", () => {
    expect(diagnoseConnection("youtube_music", "YouTube: Channel not found.")).toMatchObject({ cause: "no-channel", label: "No YouTube channel" });
    expect(diagnoseConnection("slack", "channel_not_found")?.cause).not.toBe("no-channel");
  });

  it("spots an expired sign-in and the day's used-up quota", () => {
    expect(
      diagnoseConnection("youtube_music", "Google no longer accepts the YouTube sign-in: it expired or was revoked (invalid_grant: Token has been expired or revoked.)")?.cause,
    ).toBe("expired");
    expect(diagnoseConnection("youtube_music", "Google no longer accepts the YouTube sign-in: it expired or was revoked (Invalid Credentials)")?.cause).toBe("expired");
    expect(diagnoseConnection("youtube_music", "Today's YouTube Data API quota is used up; it resets at midnight Pacific time")).toMatchObject({
      cause: "quota",
      summary: expect.stringContaining("midnight Pacific"),
    });
  });
});

describe("problemTone", () => {
  it("colours a failure by its cause alone, whichever card shows it", () => {
    const calendar = diagnoseConnection("google_calendar", "Quota exceeded for quota metric 'Queries'");
    const youtube = diagnoseConnection("youtube_music", "quotaExceeded: The request cannot be completed because you have exceeded your quota.");
    expect(calendar?.cause).toBe("quota");
    expect(youtube?.cause).toBe("quota");
    expect(problemTone(calendar?.cause)).toBe(problemTone(youtube?.cause));
  });

  it("is amber for what waiting or signing in clears", () => {
    for (const cause of ["rate-limited", "quota", "signin", "no-channel"] as const) expect(problemTone(cause)).toBe("warn");
  });

  it("is red for what needs a fix, and for unknown errors", () => {
    for (const cause of ["api-disabled", "mcp-access", "expired", "client", "scope", "token", "network", "start", "org-internal"] as const) {
      expect(problemTone(cause)).toBe("bad");
    }
    expect(problemTone(undefined)).toBe("bad");
  });
});

describe("accountTone", () => {
  it("is amber or red exactly for the states the Settings dot counts", () => {
    expect(accountTone("unconfigured")).toBe("neutral");
    expect(accountTone("signed-out")).toBe("warn");
    expect(accountTone("expired")).toBe("bad");
    expect(accountTone("signed-in")).toBe("good");
  });
});
