import { byDistanceFrom, classify, inboxReadKey, INBOX_SOURCES, moreUrgent, needsAction, type InboxBucket, type InboxFacts, type InboxItem, type InboxOpen, type InboxReason, type InboxRules, type InboxSource, type InboxView, type LinearNotificationWhat } from "@/features/inbox/model/Inbox";
import type { Overview } from "@/features/github/model/GitHub";
import type { AgentQuestion } from "@/features/sessions/model/Agent";
import type { DashboardItem, WidgetResult } from "@/features/tools/model/Dashboard";
import type { LinearNotification } from "@/features/tools/model/Tools";
import type { MailList } from "@/features/gmail/model/Gmail";

/**
 * ### InboxInputs
 *
 * Everything the Inbox is built from, already loaded. A source that failed
 * comes as an `Error`; one that is not set up as `undefined`.
 */
export type InboxInputs = {
  questions: Array<AgentQuestion>;
  agentNames: Map<string, string>;
  slack: WidgetResult | undefined;
  calendar: WidgetResult | undefined;
  linear: WidgetResult | undefined;
  /** Your Linear inbox; `undefined` when it could not be read (the Linear section says why). */
  linearNotifications: Array<LinearNotification> | undefined;
  github: { overview: Overview; statuses: Map<string, { failing: boolean; changesRequested: boolean }> } | Error;
  /** Your unread Gmail inbox; `undefined` when Gmail is not set up or signed in. */
  gmail: MailList | Error | undefined;
};

/**
 * ### InboxCandidate
 *
 * An item as its source describes it, before the rules sort it.
 */
export type InboxCandidate = Omit<InboxItem, "bucket" | "reason" | "movedBy" | "why" | "readKey" | "unread" | "needsAction">;

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/** A widget's items; a failure or missing setup becomes a problem to show instead. */
function widgetItems(result: WidgetResult | undefined, source: InboxSource, problems: InboxView["problems"]): Array<DashboardItem> {
  if (result === undefined) return [];
  if (result.status === "unavailable") {
    problems.push({ source, unavailable: result.reason });
    return [];
  }
  if (result.status === "error") {
    problems.push({
      source,
      message: result.message,
      ...(result.code === undefined ? {} : { code: result.code }),
      ...(result.connector === undefined ? {} : { connector: result.connector }),
    });
    return [];
  }
  return result.items;
}

/**
 * ### calendarCandidates
 *
 * The calendar widget's events that need you: not yet ended, not all-day
 * (holidays, out-of-office, working location), not focus time or out of
 * office. A recurring meeting shows only its next time (and, apart from
 * it, its next one still waiting for your reply). Declined events never
 * reach here.
 *
 * @param items - The widget's events, in start order.
 */
export function calendarCandidates(items: Array<DashboardItem>, now: number): Array<InboxCandidate> {
  const seenSeries = new Set<string>();
  // Events come in start order, so the first of a series is its next time.
  return items.flatMap((item): Array<InboxCandidate> => {
    const event = item.event;
    if (event === undefined || event.allDay || event.eventType !== "default") return [];
    if (event.end !== undefined && event.end <= now) return [];
    // Not answered yet, or Maybe: either way it still waits for your reply.
    const rsvp = event.myResponse === "needsAction" || event.myResponse === "tentative" ? event.myResponse : undefined;
    if (event.series !== undefined) {
      const key = `${event.series}:${rsvp === undefined ? "" : "rsvp"}`;
      if (seenSeries.has(key)) return [];
      seenSeries.add(key);
    }
    return [
      {
        id: `event:${item.id}`,
        source: "calendar",
        title: item.title,
        subtitle: item.subtitle,
        at: item.at,
        facts: { kind: "event", day: event.day, time: typeof item.meta === "string" ? item.meta : "", rsvp },
        open: { kind: "event", eventId: item.id, title: item.title },
      },
    ];
  });
}

/** When nothing is unread, read notifications from this many days back still show. */
const READ_NOTIFICATION_DAYS = 3;

const MENTION_TYPES = new Set(["issueMention", "issueCommentMention", "issueDescriptionMention"]);
const REACTION_TYPES = new Set(["issueEmojiReaction", "issueCommentReaction"]);

/**
 * ### notificationWhat
 *
 * What a Linear notification says happened, and whether it is about you
 * directly (a mention or an assignment).
 */
export function notificationWhat(n: LinearNotification): { what: LinearNotificationWhat; direct: boolean } {
  const issue = n.issueId ?? "";
  if (MENTION_TYPES.has(n.type)) return { what: { kind: "mentioned", issue }, direct: true };
  if (n.type === "issueAssignedToYou") return { what: { kind: "assigned", issue }, direct: true };
  if (n.type === "issueNewComment" || n.type === "issueCommentReply") return { what: { kind: "commented", issue }, direct: false };
  if (REACTION_TYPES.has(n.type)) return { what: { kind: "reacted", issue }, direct: false };
  // "Marked as completed by Kim", "Moved to In Review by Kim": the change without who made it.
  const change = n.subtitle.replace(/\s+by\s+.+$/, "").trim();
  return { what: change === "" ? { kind: "updated", issue } : { kind: "changed", change, issue }, direct: false };
}

/**
 * ### linearNotificationCandidates
 *
 * Unread Linear notifications about issues, or, when none are unread, the
 * last {@link READ_NOTIFICATION_DAYS} days of them. Only the newest per
 * issue is kept. Pull request notifications are left out: the GitHub items
 * already cover those.
 */
export function linearNotificationCandidates(notifications: Array<LinearNotification> | undefined, now: number): Array<InboxCandidate> {
  if (notifications === undefined) return [];
  const aboutIssues = notifications.filter((n) => n.issueId !== undefined && n.type.startsWith("issue"));
  const unread = aboutIssues.filter((n) => !n.read);
  const shown = unread.length > 0 ? unread : aboutIssues.filter((n) => now - n.at < READ_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000);
  const unreadIds = new Map<string, Array<string>>();
  for (const n of unread) unreadIds.set(n.issueId ?? "", [...(unreadIds.get(n.issueId ?? "") ?? []), n.id]);
  const seen = new Set<string>();
  return [...shown]
    .sort((a, b) => b.at - a.at)
    .flatMap((n): Array<InboxCandidate> => {
      const issueId = n.issueId ?? "";
      if (seen.has(issueId)) return [];
      seen.add(issueId);
      const { what, direct } = notificationWhat(n);
      return [
        {
          // The same id as the issue's own item, so the two fold into one.
          id: `linear:${issueId}`,
          source: "linear",
          title: n.title,
          subtitle: n.subtitle === "" ? issueId : `${issueId} · ${n.subtitle}`,
          at: n.at,
          facts: { kind: "linearNotification", direct, what },
          open: { kind: "issue", issueId, title: n.title },
          linearRead: n.read,
          linearUnreadIds: unreadIds.get(issueId),
          linearNotificationId: n.id,
        },
      ];
    });
}

/**
 * ### mailCandidates
 *
 * The unread messages of your Gmail inbox. Gmail's own unread state picks
 * them; reading one here is kept in mothership, like Slack's.
 */
export function mailCandidates(gmail: InboxInputs["gmail"], problems: InboxView["problems"]): Array<InboxCandidate> {
  if (gmail === undefined) return [];
  if (gmail instanceof Error) {
    problems.push({ source: "gmail", message: gmail.message });
    return [];
  }
  return gmail.messages
    .filter((m) => m.unread)
    .map((m) => ({
      id: `gmail:${m.id}`,
      source: "gmail",
      title: m.subject,
      subtitle: m.from,
      at: m.at,
      facts: { kind: "mail", important: m.important },
      open: { kind: "mail", messageId: m.id, title: m.subject },
    }));
}

/**
 * ### slackCandidates
 *
 * The Slack widget's messages, one row per conversation (a DM, a channel, or
 * a thread): its newest message, with how many there are in front of the
 * subtitle; opening it shows all of them. The row keeps the newest
 * message's id, so a new message makes it unread again. A message whose conversation is unknown stays on its own.
 */
export function slackCandidates(items: Array<DashboardItem>): Array<InboxCandidate> {
  const groups = new Map<string, Array<DashboardItem & { url: string; slack: NonNullable<DashboardItem["slack"]> }>>();
  for (const item of items) {
    if (item.url === undefined || item.slack === undefined) continue;
    const key = item.slack.conversation ?? `message:${item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), { ...item, url: item.url, slack: item.slack }]);
  }
  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const [newest] = sorted;
    // Outside a thread, opening it shows the conversation from the oldest of them; a thread shows whole anyway.
    const since = group.length > 1 && !newest.slack.conversation?.includes(":") ? sorted.at(-1)?.slack.ts : undefined;
    // A DM outranks a mention, and a mention an @here, as in the Slack section.
    const reason = group.some((m) => m.slack.reason === "dm") ? "dm" : group.some((m) => m.slack.reason === "mention") ? "mention" : newest.slack.reason;
    return {
      id: `slack:${newest.id}`,
      source: "slack",
      title: newest.title,
      subtitle: newest.subtitle,
      ...(group.length === 1 ? {} : { count: group.length }),
      at: newest.at,
      facts: { kind: "slack", reason, channel: newest.slack.channel } satisfies InboxFacts,
      open: { kind: "slack", url: newest.url, title: newest.title, ...(since === undefined ? {} : { since }) } satisfies InboxOpen,
    };
  });
}

type Ruled = InboxCandidate & { bucket: InboxBucket; reason: Array<InboxReason> };

/**
 * Folds items that share an id (a Linear issue and a notification about it)
 * into one: the more urgent bucket, the notification's reason first, and
 * the newer time.
 */
function fold(ruled: Array<Ruled>): Array<Ruled> {
  const byId = new Map<string, Ruled>();
  for (const item of ruled) {
    const other = byId.get(item.id);
    if (other === undefined) {
      byId.set(item.id, item);
      continue;
    }
    const [news, rest] = item.facts.kind === "linearNotification" ? [item, other] : [other, item];
    byId.set(item.id, {
      ...rest,
      subtitle: news.subtitle,
      at: Math.max(news.at ?? 0, rest.at ?? 0) || undefined,
      linearRead: news.linearRead,
      linearUnreadIds: news.linearUnreadIds,
      linearNotificationId: news.linearNotificationId,
      bucket: moreUrgent(news.bucket, rest.bucket),
      reason: [...news.reason, ...rest.reason],
    });
  }
  return [...byId.values()];
}

function agentCandidates(inputs: InboxInputs): Array<InboxCandidate> {
  return inputs.questions
    .filter((q) => q.status === "open")
    .map((question) => ({
      id: `question:${question.id}`,
      source: "agent",
      title: firstLine(question.question),
      subtitle: inputs.agentNames.get(question.agentId),
      at: question.createdAt,
      facts: { kind: "agentQuestion" },
      open: { kind: "inbox", questionId: question.id },
    }));
}

function githubCandidates(github: InboxInputs["github"], problems: InboxView["problems"]): Array<InboxCandidate> {
  if (github instanceof Error) {
    problems.push({ source: "github", message: github.message });
    return [];
  }
  const { overview, statuses } = github;
  return [
    ...overview.reviewRequests.map((pr): InboxCandidate => {
      const repo = pr.repo ?? overview.repo;
      return {
        id: `review:${repo}#${pr.number}`,
        source: "github",
        title: pr.title,
        subtitle: `${repo} #${pr.number}${pr.author === undefined ? "" : ` · ${pr.author}`}`,
        at: Date.parse(pr.updatedAt),
        facts: { kind: "reviewRequest" },
        open: { kind: "pr", repo, number: pr.number },
      };
    }),
    ...overview.myPullRequests.map((pr): InboxCandidate => {
      const repo = pr.repo ?? overview.repo;
      const status = statuses.get(`${repo}#${pr.number}`);
      return {
        id: `pr:${repo}#${pr.number}`,
        source: "github",
        title: pr.title,
        subtitle: `${repo} #${pr.number}`,
        at: Date.parse(pr.updatedAt),
        facts: { kind: "myPr", failing: status?.failing ?? false, changesRequested: status?.changesRequested ?? false, draft: pr.isDraft },
        open: { kind: "pr", repo, number: pr.number },
      };
    }),
    ...overview.assignedIssues.map((issue): InboxCandidate => {
      const repo = issue.repo ?? overview.repo;
      return {
        id: `issue:${repo}#${issue.number}`,
        source: "github",
        title: issue.title,
        subtitle: `${repo} #${issue.number}`,
        at: Date.parse(issue.updatedAt),
        facts: { kind: "githubIssue" },
        open: { kind: "url", url: issue.url },
      };
    }),
  ];
}

function linearIssueCandidates(items: Array<DashboardItem>): Array<InboxCandidate> {
  return items.map((item) => ({
    id: `linear:${item.id}`,
    source: "linear",
    title: item.title,
    subtitle: [typeof item.meta === "string" ? item.meta : undefined, item.subtitle].filter(Boolean).join(" · ") || undefined,
    at: item.at,
    facts: { kind: "linear", due: item.due, priority: item.priority },
    open: { kind: "issue", issueId: item.id, title: item.title },
  }));
}

/**
 * ### InboxSourceAdapter
 *
 * How one source's loaded input becomes Inbox candidates. A source that
 * failed or is not set up adds a problem to `problems` instead.
 */
export type InboxSourceAdapter = (inputs: InboxInputs, problems: InboxView["problems"], now: number) => Array<InboxCandidate>;

/**
 * ### INBOX_ADAPTERS
 *
 * One adapter per source: a new source adds its input to
 * {@link InboxInputs}, its id to `INBOX_SOURCES`, and its adapter here;
 * the rules, folding, and Claude's moves stay as they are. Linear's adapter
 * covers both your issues and your notifications about them.
 */
export const INBOX_ADAPTERS: Record<InboxSource, InboxSourceAdapter> = {
  agent: (inputs) => agentCandidates(inputs),
  github: (inputs, problems) => githubCandidates(inputs.github, problems),
  slack: (inputs, problems) => slackCandidates(widgetItems(inputs.slack, "slack", problems)),
  calendar: (inputs, problems, now) => calendarCandidates(widgetItems(inputs.calendar, "calendar", problems), now),
  linear: (inputs, problems, now) => [...linearIssueCandidates(widgetItems(inputs.linear, "linear", problems)), ...linearNotificationCandidates(inputs.linearNotifications, now)],
  gmail: (inputs, problems) => mailCandidates(inputs.gmail, problems),
};

/**
 * ### buildInbox
 *
 * Turns what each source returned into Inbox items sorted into buckets by
 * your rules, closest to now first. Nothing is unread yet and nothing is
 * moved: {@link applyReview} adds Claude's moves, and the service adds your
 * read marks.
 *
 * @param today - Today in the dashboard's time zone, `YYYY-MM-DD`.
 */
export function buildInbox(inputs: InboxInputs, rules: InboxRules, now: number, today: string): Pick<InboxView, "items" | "problems"> {
  const problems: InboxView["problems"] = [];
  const candidates = INBOX_SOURCES.flatMap((source) => INBOX_ADAPTERS[source](inputs, problems, now));
  const ruled = fold(
    candidates.map((candidate): Ruled => {
      const { bucket, reason } = classify(candidate.facts, candidate.at, rules, now, today);
      return { ...candidate, bucket, reason: [reason] };
    }),
  );
  const items = ruled.map((item): InboxItem => ({ ...item, readKey: inboxReadKey(item), unread: false, needsAction: needsAction(item.facts, today), movedBy: undefined }));
  return { items: items.sort(byDistanceFrom(now)), problems };
}

/**
 * ### applyReview
 *
 * Moves items where today's Claude review said, keeping Claude's words.
 * Claude never brings back what your rules hide, nor hides anything.
 *
 * @param moves - Claude's moves by item id.
 */
export function applyReview(items: Array<InboxItem>, moves: Record<string, { bucket: InboxBucket; why: string }>): Array<InboxItem> {
  return items.map((item) => {
    const moved = moves[item.id];
    return moved !== undefined && item.bucket !== "hidden" && moved.bucket !== item.bucket ? { ...item, bucket: moved.bucket, movedBy: "claude", why: moved.why } : item;
  });
}
