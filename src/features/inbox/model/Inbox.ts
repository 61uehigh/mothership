import { z } from "zod";
import type { UnavailableReason } from "@/features/tools/model/Dashboard";
import type { ErrorCode, ToolErrorCode } from "@/lib/apiErrorCodes";

/**
 * ### INBOX_BUCKETS
 *
 * When something needs you: today (shown as Needs you), this week (Soon),
 * later, or never (hidden). A priority, not the date the item happened.
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
 * ### INBOX_THRESHOLD_MAX
 *
 * The largest value each number in {@link inboxRulesSchema} takes; the
 * smallest is 1.
 */
export const INBOX_THRESHOLD_MAX = { slackRecentHours: 24 * 30, linearDueDays: 60, linearNotifyHours: 24 * 30 } as const;

/**
 * ### inboxRulesSchema
 *
 * How the Inbox sorts items, editable in Settings → Inbox. Each kind of
 * item goes to a bucket; Slack messages, calendar events, and Linear issues
 * also by age, date, and priority. Defaults are in {@link DEFAULT_INBOX_RULES}, so
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
  /** Slack DMs and mentions newer than this many hours count as recent. */
  slackRecentHours: z.number().int().min(1).max(INBOX_THRESHOLD_MAX.slackRecentHours),
  /** A recent DM to you. */
  slackRecent: bucket,
  /** An older DM to you. */
  slackOlder: bucket,
  /** A recent channel or thread message that @-mentions you. */
  slackMentionRecent: bucket,
  /** An older one. */
  slackMentionOlder: bucket,
  /**
   * `@here` / `@channel` in a channel you are in. `hidden` (the default)
   * also skips searching for them, which saves two Slack searches per load.
   */
  slackGroupMention: bucket,
  /** A calendar event later today, or one in progress. */
  calendarToday: bucket,
  /** A calendar event in the next 7 days. */
  calendarWeek: bucket,
  /** An invitation in the next 7 days you have not answered, or answered Maybe. */
  calendarRsvp: bucket,
  /** A Linear issue past its due date or due today, or marked Urgent. */
  linearUrgent: bucket,
  /** A Linear issue due within this many days… */
  linearDueDays: z.number().int().min(1).max(INBOX_THRESHOLD_MAX.linearDueDays),
  /** …or marked High, */
  linearSoon: bucket,
  /** and every other Linear issue. */
  linearOther: bucket,
  /** Linear notifications newer than this many hours count as recent. */
  linearNotifyHours: z.number().int().min(1).max(INBOX_THRESHOLD_MAX.linearNotifyHours),
  /** A recent Linear notification that you were mentioned or assigned. */
  linearNotifyDirect: bucket,
  /** A recent Linear notification of another kind: a comment, a status change, a reaction. */
  linearNotifyOther: bucket,
  /** An older Linear notification. */
  linearNotifyOlder: bucket,
  /** An unread Gmail inbox message Gmail marked important. */
  gmailImportant: bucket,
  /** Any other unread Gmail inbox message. */
  gmailUnread: bucket,
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
  slackMentionRecent: "today",
  slackMentionOlder: "week",
  slackGroupMention: "hidden",
  calendarToday: "today",
  calendarWeek: "week",
  calendarRsvp: "today",
  linearUrgent: "today",
  linearDueDays: 7,
  linearSoon: "week",
  linearOther: "month",
  linearNotifyHours: 24,
  linearNotifyDirect: "today",
  linearNotifyOther: "week",
  linearNotifyOlder: "month",
  gmailImportant: "today",
  gmailUnread: "week",
  claudeReview: true,
};

/**
 * ### INBOX_SOURCES
 *
 * Where items come from, in the order the Inbox gathers them. Each has an
 * adapter on the server (`INBOX_ADAPTERS`) and a look in the pane.
 */
export const INBOX_SOURCES = ["agent", "github", "slack", "calendar", "linear", "gmail"] as const;

/**
 * ### InboxSource
 *
 * One of {@link INBOX_SOURCES}.
 */
export type InboxSource = (typeof INBOX_SOURCES)[number];

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
  | {
      kind: "slack";
      /** A DM to you, a message that @-mentions you, or an `@here` / `@channel`. */
      reason: "dm" | "mention" | "group";
      /** Where it was posted: `#channel`, or `DM`. */
      channel: string;
    }
  | {
      kind: "event";
      /** Its local date, `YYYY-MM-DD`. */
      day: string;
      /** e.g. `10:00–10:15`. */
      time: string;
      /** You were invited and have not said yes: `needsAction` or `tentative`. */
      rsvp: "needsAction" | "tentative" | undefined;
    }
  | { kind: "linear"; due: string | undefined; priority: number | undefined }
  | {
      kind: "linearNotification";
      /** You were mentioned or assigned, rather than told about a comment or a change. */
      direct: boolean;
      what: LinearNotificationWhat;
    }
  | {
      kind: "mail";
      /** Gmail marked it important. */
      important: boolean;
    };

/**
 * ### LinearNotificationWhat
 *
 * What a Linear notification says happened to `issue` (its identifier,
 * e.g. `DEV-12`). `changed` is any other change, in Linear's own words
 * without who made it (`change`, e.g. "Moved to In Review").
 */
export type LinearNotificationWhat =
  | { kind: "mentioned" | "assigned" | "commented" | "reacted" | "updated"; issue: string }
  | { kind: "changed"; change: string; issue: string };

/**
 * ### InboxReason
 *
 * Why the rules put an item where they did, as facts the browser words:
 * - GitHub and agents: what the item is (`review-request`, `my-pr-failing`, …).
 * - `slack-dm` / `slack-mention`: `recent` when newer than `hours`.
 * - `event`: in `days` (0 today, 1 tomorrow) at `time`, with `rsvp` when it waits for your reply.
 * - `linear-notification`: `olderThanHours` is set once it is older than the rule's hours.
 * - Linear issues: `linear-overdue` / `linear-due-in` count whole `days`.
 */
export type InboxReason =
  | { code: "agent-question" }
  | { code: "review-request" }
  | { code: "my-pr-failing" }
  | { code: "my-pr-changes" }
  | { code: "my-draft-pr" }
  | { code: "my-pr" }
  | { code: "github-issue" }
  | { code: "slack-dm"; hours: number; recent: boolean }
  | { code: "slack-mention"; channel: string; hours: number; recent: boolean }
  | { code: "slack-group"; channel: string }
  | { code: "event"; days: number; time: string; rsvp: "needsAction" | "tentative" | undefined }
  | { code: "linear-notification"; what: LinearNotificationWhat; olderThanHours: number | undefined }
  | { code: "mail-important" }
  | { code: "mail-unread" }
  | { code: "linear-overdue"; days: number }
  | { code: "linear-due-today" }
  | { code: "linear-urgent" }
  | { code: "linear-due-in"; days: number }
  | { code: "linear-high" }
  | { code: "linear-subscribed" };

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
  /** `since`: a grouped conversation's oldest message, so all of them show. */
  | { kind: "slack"; url: string; title: string; since?: string }
  | { kind: "event"; eventId: string; title: string }
  | { kind: "mail"; messageId: string; title: string }
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
  /** How many Slack messages it groups, when more than one. */
  count?: number;
  bucket: InboxBucket;
  /** Why the rules put it in that bucket; two when an issue and a notification about it folded into one item. */
  reason: Array<InboxReason>;
  /** Set when Claude's daily review moved it from where the rules put it. */
  movedBy: "claude" | undefined;
  /** Claude's own words for the move, when it moved the item. */
  why?: string;
  /** Linear's own read state of the notification this item shows, when it shows one. */
  linearRead?: boolean;
  /** Unread Linear notifications about this issue, marked read in Linear when you read it here. */
  linearUnreadIds?: Array<string>;
  /** The newest Linear notification about this issue, marked unread in Linear when you mark it unread here. */
  linearNotificationId?: string;
  /** What a read mark is kept under: see {@link inboxReadKey}. */
  readKey: string;
  unread: boolean;
  /** Overdue, failing, or waiting on you: marked so it stands out in the newest-first list. */
  needsAction: boolean;
};

/**
 * ### ReviewFailure
 *
 * Why the last background review failed: its `code` when it has one (e.g.
 * `claude-timeout`, `claude-login`), which the browser words with `params`,
 * and the English `message` for any other failure.
 */
export type ReviewFailure = { code: ErrorCode | undefined; params: Readonly<Record<string, string>> | undefined; message: string };

/**
 * ### InboxView
 *
 * The Inbox as the browser gets it.
 */
export type InboxView = {
  items: Array<InboxItem>;
  /** Sources that failed (`message`, as thrown, with `code` when mothership recognized it) or are not set up (`unavailable`, worded by the browser). */
  problems: Array<{ source: InboxSource; message: string; code?: ToolErrorCode; connector?: string } | { source: InboxSource; unavailable: UnavailableReason }>;
  /** Epoch milliseconds of Claude's last review, when there was one. */
  reviewedAt: number | undefined;
  /** A review is running now. */
  reviewing: boolean;
  /** Why the last background review failed, if it did. */
  reviewError: ReviewFailure | undefined;
  /** Epoch milliseconds of the 1st of this month, 00:00, in the dashboard's time zone, so the browser folds Later into Older at the server's month boundary. */
  monthStart: number;
};

/**
 * ### inboxReadKey
 *
 * What a read mark is kept under. GitHub and Linear items carry their last
 * update time, so a new comment or change on the same pull request or issue
 * makes it unread again; a Slack message, an email, an event, or an agent's
 * question is one thing that does not change, so its id is enough.
 */
export function inboxReadKey(item: Pick<InboxItem, "id" | "source" | "at">): string {
  const versioned = item.source === "github" || item.source === "linear";
  return versioned && item.at !== undefined ? `${item.id}@${item.at}` : item.id;
}

/**
 * ### InboxReadState
 *
 * Read marks kept in mothership, from `.mothership/inbox-read.json`.
 */
export type InboxReadState = {
  /** Epoch milliseconds read tracking started; anything from before then counts as read. */
  since: number;
  /** By {@link inboxReadKey}: whether you read or unread it, and when you did. */
  marks: Record<string, { read: boolean; at: number }>;
};

/**
 * ### isUnread
 *
 * Your own mark wins (opening an item, Mark as read or unread). Without
 * one, a Linear notification follows Linear's read state; anything else is
 * unread when it happened after read tracking started (or has no time).
 *
 * @param state - `undefined` before read tracking started: nothing is unread then.
 */
export function isUnread(item: Pick<InboxItem, "readKey" | "at" | "linearRead">, state: InboxReadState | undefined): boolean {
  if (state === undefined) return false;
  const mark = state.marks[item.readKey];
  if (mark !== undefined) return !mark.read;
  if (item.linearRead !== undefined) return !item.linearRead;
  return item.at === undefined || item.at > state.since;
}

/**
 * ### readMarkFor
 *
 * What marking `item` read or unread sends: its read key, and the Linear
 * notifications to mark the same way in Linear. Reading it reads all its
 * unread notifications there; unreading it unreads only the newest, as
 * Linear's own inbox shows one per issue.
 */
export function readMarkFor(item: Pick<InboxItem, "readKey" | "linearUnreadIds" | "linearNotificationId">, read: boolean): { keys: Array<string>; linearIds: Array<string> } {
  const linearIds = read ? (item.linearUnreadIds ?? []) : item.linearNotificationId === undefined ? [] : [item.linearNotificationId];
  return { keys: [item.readKey], linearIds };
}

/**
 * ### needsAction
 *
 * Things waiting on you that the newest-first list must not bury: an
 * agent's question, a review request, your PR with failing checks, an
 * invitation you have not answered, and an overdue Linear issue.
 *
 * @param today - Today in the dashboard's time zone, `YYYY-MM-DD`.
 */
export function needsAction(facts: InboxFacts, today: string): boolean {
  switch (facts.kind) {
    case "agentQuestion":
    case "reviewRequest":
      return true;
    case "myPr":
      return facts.failing;
    case "event":
      return facts.rsvp !== undefined;
    case "linear":
      return facts.due !== undefined && facts.due < today;
    default:
      return false;
  }
}

/**
 * ### INBOX_VIEWS
 *
 * How the Inbox lists items: `newest`, the default, is one list by each
 * item's own time with what needs you today pinned on top; `urgency` groups
 * them by bucket (Needs you, Soon, Later).
 */
export const INBOX_VIEWS = ["urgency", "newest"] as const;

/**
 * ### InboxListView
 *
 * One of {@link INBOX_VIEWS}.
 */
export type InboxListView = (typeof INBOX_VIEWS)[number];

/**
 * ### InboxGroup
 *
 * A heading the grouped Inbox lists items under: the visible buckets, plus
 * `older` for Later items whose time is before this month began.
 */
export type InboxGroup = Exclude<InboxBucket, "hidden"> | "older";

/**
 * ### inboxGroup
 *
 * Which heading an item goes under. A Later (month-bucket) item that last
 * happened before this month began (an issue assigned two years ago and
 * never touched) is Older instead, folded out of the way. Items without
 * a time, and upcoming ones, stay where the rules put them.
 *
 * @param monthStart - Epoch milliseconds of the 1st of this month, 00:00, in your time zone.
 * @returns `undefined` for a hidden item.
 */
export function inboxGroup(item: Pick<InboxItem, "bucket" | "at">, monthStart: number): InboxGroup | undefined {
  if (item.bucket === "hidden") return undefined;
  if (item.bucket === "month" && item.at !== undefined && item.at < monthStart) return "older";
  return item.bucket;
}

/**
 * ### newestFirst
 *
 * The items you see (hidden ones left out) closest to now first: what
 * happened most recently on top, and an upcoming event by how soon it
 * starts rather than ahead of everything for being in the future. Items
 * without a time go last.
 */
export function newestFirst(items: Array<InboxItem>, now: number): Array<InboxItem> {
  return items.filter((item) => item.bucket !== "hidden").sort(byDistanceFrom(now));
}

/**
 * ### byDistanceFrom
 *
 * A sort comparator: closest to `now` first, in the past or the future;
 * items without a time last.
 */
export function byDistanceFrom(now: number): (a: Pick<InboxItem, "at">, b: Pick<InboxItem, "at">) => number {
  const distance = (item: Pick<InboxItem, "at">) => (item.at === undefined ? Infinity : Math.abs(now - item.at));
  // Two untimed items are equal; Infinity - Infinity would be NaN.
  return (a, b) => (distance(a) === distance(b) ? 0 : distance(a) - distance(b));
}

/**
 * ### moreUrgent
 *
 * @returns Whichever of two buckets comes first: today, week, month, then hidden.
 */
export function moreUrgent(a: InboxBucket, b: InboxBucket): InboxBucket {
  return INBOX_BUCKETS.indexOf(a) <= INBOX_BUCKETS.indexOf(b) ? a : b;
}

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
 * @param today - Today in the dashboard's time zone, `YYYY-MM-DD`.
 * @returns The bucket and why.
 */
export function classify(facts: InboxFacts, at: number | undefined, rules: InboxRules, now: number, today: string): { bucket: InboxBucket; reason: InboxReason } {
  switch (facts.kind) {
    case "agentQuestion":
      return { bucket: rules.agentQuestion, reason: { code: "agent-question" } };
    case "reviewRequest":
      return { bucket: rules.reviewRequest, reason: { code: "review-request" } };
    case "myPr":
      if (facts.failing) return { bucket: rules.myPrFailing, reason: { code: "my-pr-failing" } };
      if (facts.changesRequested) return { bucket: rules.myPrChanges, reason: { code: "my-pr-changes" } };
      return { bucket: rules.myPr, reason: { code: facts.draft ? "my-draft-pr" : "my-pr" } };
    case "githubIssue":
      return { bucket: rules.githubIssue, reason: { code: "github-issue" } };
    case "slack": {
      const hours = rules.slackRecentHours;
      const recent = at !== undefined && now - at < hours * 60 * 60 * 1000;
      switch (facts.reason) {
        case "dm":
          return { bucket: recent ? rules.slackRecent : rules.slackOlder, reason: { code: "slack-dm", hours, recent } };
        case "mention":
          return { bucket: recent ? rules.slackMentionRecent : rules.slackMentionOlder, reason: { code: "slack-mention", channel: facts.channel, hours, recent } };
        case "group":
          return { bucket: rules.slackGroupMention, reason: { code: "slack-group", channel: facts.channel } };
      }
    }
    case "event": {
      const days = Math.max(daysUntil(facts.day, today), 0);
      const reason: InboxReason = { code: "event", days, time: facts.time, rsvp: facts.rsvp };
      if (facts.rsvp !== undefined) return { bucket: rules.calendarRsvp, reason };
      return { bucket: days === 0 ? rules.calendarToday : rules.calendarWeek, reason };
    }
    case "linearNotification": {
      const hours = rules.linearNotifyHours;
      const recent = at !== undefined && now - at < hours * 60 * 60 * 1000;
      const reason: InboxReason = { code: "linear-notification", what: facts.what, olderThanHours: recent ? undefined : hours };
      if (!recent) return { bucket: rules.linearNotifyOlder, reason };
      return { bucket: facts.direct ? rules.linearNotifyDirect : rules.linearNotifyOther, reason };
    }
    case "mail":
      return facts.important ? { bucket: rules.gmailImportant, reason: { code: "mail-important" } } : { bucket: rules.gmailUnread, reason: { code: "mail-unread" } };
    case "linear": {
      const days = facts.due === undefined ? undefined : daysUntil(facts.due, today);
      if (days !== undefined && days < 0) return { bucket: rules.linearUrgent, reason: { code: "linear-overdue", days: -days } };
      if (days === 0) return { bucket: rules.linearUrgent, reason: { code: "linear-due-today" } };
      if (facts.priority === 1) return { bucket: rules.linearUrgent, reason: { code: "linear-urgent" } };
      if (days !== undefined && days <= rules.linearDueDays) return { bucket: rules.linearSoon, reason: { code: "linear-due-in", days } };
      if (facts.priority === 2) return { bucket: rules.linearSoon, reason: { code: "linear-high" } };
      return { bucket: rules.linearOther, reason: days === undefined ? { code: "linear-subscribed" } : { code: "linear-due-in", days } };
    }
  }
}
