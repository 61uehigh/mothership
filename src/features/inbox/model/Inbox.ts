import { z } from "zod";

/**
 * ### INBOX_BUCKETS
 *
 * When something needs you: today, this week, this month, or never (hidden).
 */
export const INBOX_BUCKETS = ["today", "week", "month", "hidden"] as const;

/**
 * ### InboxBucket
 *
 * One of {@link INBOX_BUCKETS}.
 */
export type InboxBucket = (typeof INBOX_BUCKETS)[number];

const bucket = z.enum(INBOX_BUCKETS);

/**
 * ### inboxRulesSchema
 *
 * How the Inbox sorts items, editable in Settings → Inbox. Each kind of
 * item goes to a bucket; Slack messages and Linear issues also by age, due
 * date, and priority. Defaults are in {@link DEFAULT_INBOX_RULES}, so
 * `.partial()` gives a change that touches only what it names.
 */
export const inboxRulesSchema = z.object({
  /** An agent's open question to you. */
  agentQuestion: bucket,
  /** A pull request waiting for your review. */
  reviewRequest: bucket,
  /** Your pull request whose checks failed. */
  myPrFailing: bucket,
  /** Your pull request a reviewer asked changes on. */
  myPrChanges: bucket,
  /** Your other open pull requests. */
  myPr: bucket,
  /** A GitHub issue assigned to you. */
  githubIssue: bucket,
  /** Slack mentions and DMs newer than this many hours… */
  slackRecentHours: z.number().int().min(1).max(24 * 30),
  /** …go here, */
  slackRecent: bucket,
  /** and older ones here. */
  slackOlder: bucket,
  /** A Linear issue past its due date or due today, or marked Urgent. */
  linearUrgent: bucket,
  /** A Linear issue due within this many days… */
  linearDueDays: z.number().int().min(1).max(60),
  /** …or marked High, */
  linearSoon: bucket,
  /** and every other Linear issue. */
  linearOther: bucket,
  /** Once a day, Claude moves items the rules seem to have sorted wrongly. */
  claudeReview: z.boolean(),
});

/**
 * ### InboxRules
 *
 * See {@link inboxRulesSchema}.
 */
export type InboxRules = z.infer<typeof inboxRulesSchema>;

/**
 * ### DEFAULT_INBOX_RULES
 *
 * The rules until you change them.
 */
export const DEFAULT_INBOX_RULES: InboxRules = {
  agentQuestion: "today",
  reviewRequest: "today",
  myPrFailing: "today",
  myPrChanges: "today",
  myPr: "week",
  githubIssue: "month",
  slackRecentHours: 24,
  slackRecent: "today",
  slackOlder: "week",
  linearUrgent: "today",
  linearDueDays: 7,
  linearSoon: "week",
  linearOther: "month",
  claudeReview: true,
};

/**
 * ### InboxSource
 *
 * Where an item comes from.
 */
export type InboxSource = "agent" | "github" | "slack" | "linear";

/**
 * ### InboxFacts
 *
 * What the rules look at, by kind of item.
 */
export type InboxFacts =
  | { kind: "agentQuestion" }
  | { kind: "reviewRequest" }
  | { kind: "myPr"; failing: boolean; changesRequested: boolean; draft: boolean }
  | { kind: "githubIssue" }
  | { kind: "slack"; mention: boolean }
  | { kind: "linear"; due: string | undefined; priority: number | undefined };

/**
 * ### InboxOpen
 *
 * What a click on an item opens: a tab of its own (matching the shell's
 * tabs), or the item's page in your browser.
 */
export type InboxOpen =
  | { kind: "inbox"; questionId: string }
  | { kind: "pr"; repo: string; number: number }
  | { kind: "issue"; issueId: string; title: string }
  | { kind: "slack"; url: string; title: string }
  | { kind: "url"; url: string };

/**
 * ### InboxItem
 *
 * One thing that may need you, sorted into a bucket with the reason.
 */
export type InboxItem = {
  /** Stable across loads, e.g. `pr:owner/repo#12`, `slack:…`. */
  id: string;
  source: InboxSource;
  title: string;
  subtitle: string | undefined;
  /** Epoch milliseconds it happened or was last updated. */
  at: number | undefined;
  facts: InboxFacts;
  open: InboxOpen;
  bucket: InboxBucket;
  /** Why it is in that bucket, e.g. "Due in 3 days". */
  reason: string;
  /** Set when Claude's daily review moved it from where the rules put it. */
  movedBy: "claude" | undefined;
};

/**
 * ### InboxView
 *
 * The Inbox as the browser gets it.
 */
export type InboxView = {
  items: Array<InboxItem>;
  /** Sources that failed or are not set up, with why. */
  problems: Array<{ source: InboxSource; message: string }>;
  /** Epoch milliseconds of Claude's last review, when there was one. */
  reviewedAt: number | undefined;
  /** A review is running now. */
  reviewing: boolean;
  /** Why the last background review failed, if it did. */
  reviewError: string | undefined;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `today` to `due`, both `YYYY-MM-DD`: 0 today, negative overdue. */
function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/**
 * ### classify
 *
 * Sorts one item by the rules.
 *
 * @param today - Your local date, `YYYY-MM-DD`.
 * @returns The bucket and why.
 */
export function classify(facts: InboxFacts, at: number | undefined, rules: InboxRules, now: number, today: string): { bucket: InboxBucket; reason: string } {
  switch (facts.kind) {
    case "agentQuestion":
      return { bucket: rules.agentQuestion, reason: "An agent is waiting for your answer" };
    case "reviewRequest":
      return { bucket: rules.reviewRequest, reason: "Waiting for your review" };
    case "myPr":
      if (facts.failing) return { bucket: rules.myPrFailing, reason: "Your PR's checks failed" };
      if (facts.changesRequested) return { bucket: rules.myPrChanges, reason: "Changes requested on your PR" };
      return { bucket: rules.myPr, reason: facts.draft ? "Your draft PR" : "Your open PR" };
    case "githubIssue":
      return { bucket: rules.githubIssue, reason: "Assigned to you" };
    case "slack": {
      const what = facts.mention ? "Mention" : "DM";
      const recent = at !== undefined && now - at < rules.slackRecentHours * 60 * 60 * 1000;
      return recent
        ? { bucket: rules.slackRecent, reason: `${what} in the last ${rules.slackRecentHours}h` }
        : { bucket: rules.slackOlder, reason: `${what} older than ${rules.slackRecentHours}h` };
    }
    case "linear": {
      const days = facts.due === undefined ? undefined : daysUntil(facts.due, today);
      if (days !== undefined && days < 0) return { bucket: rules.linearUrgent, reason: `Overdue by ${-days} day${days === -1 ? "" : "s"}` };
      if (days === 0) return { bucket: rules.linearUrgent, reason: "Due today" };
      if (facts.priority === 1) return { bucket: rules.linearUrgent, reason: "Urgent" };
      if (days !== undefined && days <= rules.linearDueDays) return { bucket: rules.linearSoon, reason: `Due in ${days} day${days === 1 ? "" : "s"}` };
      if (facts.priority === 2) return { bucket: rules.linearSoon, reason: "High priority" };
      return { bucket: rules.linearOther, reason: days === undefined ? "Assigned to you" : `Due in ${days} days` };
    }
  }
}
