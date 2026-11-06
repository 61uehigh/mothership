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

  it("sorts Slack by age", () => {
    expect(classify({ kind: "slack", mention: true }, NOW - 2 * HOUR, DEFAULT_INBOX_RULES, NOW, TODAY)).toEqual({ bucket: "today", reason: "Mention in the last 24h" });
    expect(classify({ kind: "slack", mention: false }, NOW - 30 * HOUR, DEFAULT_INBOX_RULES, NOW, TODAY)).toEqual({ bucket: "week", reason: "DM older than 24h" });
  });

  it("sorts Linear by due date, then priority", () => {
    const linear = (due: string | undefined, priority: number | undefined) => classify({ kind: "linear", due, priority }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY);
    expect(linear("2026-11-01", 3)).toEqual({ bucket: "today", reason: "Overdue by 2 days" });
    expect(linear("2026-11-03", 4)).toEqual({ bucket: "today", reason: "Due today" });
    expect(linear(undefined, 1)).toEqual({ bucket: "today", reason: "Urgent" });
    expect(linear("2026-11-06", 4)).toEqual({ bucket: "week", reason: "Due in 3 days" });
    expect(linear(undefined, 2)).toEqual({ bucket: "week", reason: "High priority" });
    expect(linear("2026-12-01", 3)).toEqual({ bucket: "month", reason: "Due in 28 days" });
    expect(linear(undefined, 0)).toEqual({ bucket: "month", reason: "Assigned to you" });
  });

  it("follows your rules", () => {
    const rules = { ...DEFAULT_INBOX_RULES, reviewRequest: "week" as const, slackRecentHours: 4 };
    expect(classify({ kind: "reviewRequest" }, undefined, rules, NOW, TODAY).bucket).toBe("week");
    expect(classify({ kind: "slack", mention: true }, NOW - 5 * HOUR, rules, NOW, TODAY).bucket).toBe("week");
  });
});
