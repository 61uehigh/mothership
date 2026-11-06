import { describe, expect, it } from "vitest";
import { classify, DEFAULT_INBOX_RULES } from "@/features/inbox/model/Inbox";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const TODAY = "2026-11-03";
const HOUR = 60 * 60 * 1000;

describe("classify", () => {
  it("puts review requests, failing PRs, and agent questions in today", () => {
    expect(classify({ kind: "reviewRequest" }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("today");
    expect(classify({ kind: "myPr", failing: true, changesRequested: false, draft: false }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("today");
    expect(classify({ kind: "myPr", failing: false, changesRequested: false, draft: false }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("week");
    expect(classify({ kind: "myPr", failing: false, changesRequested: true, draft: false }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).reason).toBe("Changes requested on your PR");
    expect(classify({ kind: "agentQuestion" }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("today");
  });

  it("sorts Slack DMs and mentions by age, each by its own rule", () => {
    const slack = (reason: "dm" | "mention" | "group", channel: string, at: number, rules = DEFAULT_INBOX_RULES) => classify({ kind: "slack", reason, channel }, at, rules, NOW, TODAY);
    expect(slack("dm", "DM", NOW - 2 * HOUR)).toEqual({ bucket: "today", reason: "DM in the last 24h" });
    expect(slack("dm", "DM", NOW - 30 * HOUR)).toEqual({ bucket: "week", reason: "DM older than 24h" });
    expect(slack("mention", "#dev", NOW - 2 * HOUR)).toEqual({ bucket: "today", reason: "Mentioned you in #dev, in the last 24h" });
    expect(slack("mention", "#dev", NOW - 30 * HOUR)).toEqual({ bucket: "week", reason: "Mentioned you in #dev, older than 24h" });
    // @here / @channel stay hidden until you choose a bucket for them.
    expect(slack("group", "#general", NOW - 2 * HOUR).bucket).toBe("hidden");
    expect(slack("group", "#general", NOW - 2 * HOUR, { ...DEFAULT_INBOX_RULES, slackGroupMention: "month" })).toEqual({ bucket: "month", reason: "@here or @channel in #general" });
    // Mentions follow their own rule, not the DM one.
    const rules = { ...DEFAULT_INBOX_RULES, slackRecent: "week" as const, slackMentionRecent: "today" as const };
    expect(slack("dm", "DM", NOW - 2 * HOUR, rules).bucket).toBe("week");
    expect(slack("mention", "#dev", NOW - 2 * HOUR, rules).bucket).toBe("today");
  });

  it("sorts calendar events by day, and invitations waiting for you first", () => {
    const event = (day: string, rsvp?: "needsAction" | "tentative") => classify({ kind: "event", day, time: "10:00–10:15", rsvp }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY);
    expect(event("2026-11-03")).toEqual({ bucket: "today", reason: "Today 10:00–10:15" });
    expect(event("2026-11-04")).toEqual({ bucket: "week", reason: "Tomorrow 10:00–10:15" });
    expect(event("2026-11-06")).toEqual({ bucket: "week", reason: "In 3 days, 10:00–10:15" });
    expect(event("2026-11-06", "needsAction")).toEqual({ bucket: "today", reason: "Needs your RSVP, In 3 days, 10:00–10:15" });
    expect(event("2026-11-03", "tentative").reason).toBe("Needs your RSVP (you said Maybe), Today 10:00–10:15");
  });

  it("sorts Linear by due date, then priority", () => {
    const linear = (due: string | undefined, priority: number | undefined) => classify({ kind: "linear", due, priority }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY);
    expect(linear("2026-11-01", 3)).toEqual({ bucket: "today", reason: "Overdue by 2 days" });
    expect(linear("2026-11-03", 4)).toEqual({ bucket: "today", reason: "Due today" });
    expect(linear(undefined, 1)).toEqual({ bucket: "today", reason: "Urgent" });
    expect(linear("2026-11-06", 4)).toEqual({ bucket: "week", reason: "Due in 3 days" });
    expect(linear(undefined, 2)).toEqual({ bucket: "week", reason: "High priority" });
    expect(linear("2026-12-01", 3)).toEqual({ bucket: "month", reason: "Due in 28 days" });
    expect(linear(undefined, 0)).toEqual({ bucket: "month", reason: "You're subscribed" });
  });

  it("follows your rules", () => {
    const rules = { ...DEFAULT_INBOX_RULES, reviewRequest: "week" as const, slackRecentHours: 4 };
    expect(classify({ kind: "reviewRequest" }, undefined, rules, NOW, TODAY).bucket).toBe("week");
    expect(classify({ kind: "slack", reason: "mention", channel: "#dev" }, NOW - 5 * HOUR, rules, NOW, TODAY).bucket).toBe("week");
  });
});
