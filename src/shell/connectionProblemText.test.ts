import { describe, expect, it } from "vitest";
import { diagnoseConnection, type KnownToolError } from "@/features/settings/model/connectionDiagnosis";
import { problemDetail, problemLabel, problemSummary } from "@/shell/connectionProblemText";
import { translator } from "@/ui/i18n/translate";

const en = translator("en");

function worded(id: string, raw: string, tool: string, known?: KnownToolError) {
  const problem = diagnoseConnection(id, raw, known);
  if (problem === undefined) throw new Error(`not diagnosed: ${raw}`);
  return { label: problemLabel(en, problem), summary: problemSummary(en, problem, tool), detail: problemDetail(en, problem) };
}

describe("connection problem wording", () => {
  it("names the API whose quota is used up, but the daily reset for YouTube", () => {
    expect(worded("google_calendar", "Quota exceeded for quota metric 'Queries'", "Google Calendar")).toMatchObject({
      summary: "The Calendar API quota is used up. Check again later.",
      detail: "Your Google Cloud project used up its Calendar API quota for now.",
    });
    expect(worded("youtube_music", "quotaExceeded: you have exceeded your quota.", "YouTube Music").summary).toBe("Today's YouTube quota is used up. It resets at midnight Pacific.");
  });

  it("names the project of a disabled API when the error does", () => {
    expect(worded("gmail", "Gmail API has not been used in project 123 before or it is disabled.", "Gmail")).toMatchObject({
      summary: "Turn on the Gmail API in Google Cloud.",
      detail: "It is off in your Google Cloud project (123). Turning it on can take a few minutes to apply.",
    });
  });

  it("words a Gmail sign-in without mail access apart from a token's missing scope", () => {
    expect(worded("gmail", "Request had insufficient authentication scopes.", "Gmail")).toMatchObject({ label: "No mail access", summary: "The Gmail sign-in can't read mail. Sign in again and allow it." });
    expect(worded("slack", '{"error":"missing_scope","needed":"search:read.public"}', "Slack")).toMatchObject({
      label: "Missing permission",
      summary: "The key lacks the search:read.public scope.",
      detail: "Add it in your Slack app's OAuth & Permissions, reinstall the app, and replace the key with the new one.",
    });
    expect(worded("notion", "Insufficient permissions (restricted_resource)", "Notion")).toMatchObject({
      summary: "The key lacks a permission this needs.",
      detail: "Give the key that permission (or make a new one) and replace it.",
    });
  });

  it("says mothership retries on its own only for the sidebar's own rate limit", () => {
    expect(worded("nuclino", "Nuclino is rate limiting requests", "Nuclino", { code: "rate-limited" }).summary).toBe("Nuclino is rate limiting requests; mothership tries again on its own.");
    expect(worded("nuclino", "You've made too many requests and hit a rate limit", "Nuclino").summary).toBe("Nuclino is rate limiting requests. Check again in a minute.");
  });
});
