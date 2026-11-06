import { classify, moreUrgent, type InboxBucket, type InboxFacts, type InboxItem, type InboxOpen, type InboxRules, type InboxSource, type InboxView } from "@/features/inbox/model/Inbox";
import type { Overview } from "@/features/github/model/GitHub";
import type { AgentQuestion } from "@/features/sessions/model/Agent";
import type { DashboardItem, WidgetResult } from "@/features/tools/model/Dashboard";
import type { LinearNotification } from "@/features/tools/model/Tools";

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
};

type Candidate = Omit<InboxItem, "bucket" | "reason" | "movedBy">;

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/** A widget's items; a failure or missing setup becomes a problem to show instead. */
function widgetItems(result: WidgetResult | undefined, source: InboxSource, problems: InboxView["problems"]): Array<DashboardItem> {
  if (result === undefined) return [];
  if (result.status === "unavailable") {
    problems.push({ source, message: result.reason });
    return [];
  }
  if (result.status === "error") {
    problems.push({ source, message: result.message });
    return [];
  }
  return result.items;
}

/** A widget's items as candidates; a failure or missing setup becomes a problem to show. */
function fromWidget(
  result: WidgetResult | undefined,
  source: InboxSource,
  problems: InboxView["problems"],
  toCandidate: (item: DashboardItem) => Candidate | undefined,
): Array<Candidate> {
  return widgetItems(result, source, problems).flatMap((item) => toCandidate(item) ?? []);
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
export function calendarCandidates(items: Array<DashboardItem>, now: number): Array<Candidate> {
  const seenSeries = new Set<string>();
  // Events come in start order, so the first of a series is its next time.
  return items.flatMap((item): Array<Candidate> => {
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
        facts: { kind: "event", day: event.day, time: item.meta ?? "", rsvp },
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
 * A Linear notification in a few words, and whether it is about you
 * directly (a mention or an assignment).
 */
export function notificationWhat(n: LinearNotification): { what: string; direct: boolean } {
  const id = n.issueId ?? "an issue";
  if (MENTION_TYPES.has(n.type)) return { what: `Mentioned you on ${id}`, direct: true };
  if (n.type === "issueAssignedToYou") return { what: `Assigned to you: ${id}`, direct: true };
  if (n.type === "issueNewComment" || n.type === "issueCommentReply") return { what: `Commented on ${id}`, direct: false };
  if (REACTION_TYPES.has(n.type)) return { what: `Reacted on ${id}`, direct: false };
  // "Marked as completed by Kim", "Moved to In Review by Kim": the change without who made it.
  const change = n.subtitle.replace(/\s+by\s+.+$/, "").trim();
  return { what: change === "" ? `Updated ${id}` : `${change}: ${id}`, direct: false };
}

/**
 * ### linearNotificationCandidates
 *
 * Unread Linear notifications about issues, or, when none are unread, the
 * last {@link READ_NOTIFICATION_DAYS} days of them. Only the newest per
 * issue is kept. Pull request notifications are left out: the GitHub items
 * already cover those.
 */
export function linearNotificationCandidates(notifications: Array<LinearNotification> | undefined, now: number): Array<Candidate> {
  if (notifications === undefined) return [];
  const aboutIssues = notifications.filter((n) => n.issueId !== undefined && n.type.startsWith("issue"));
  const unread = aboutIssues.filter((n) => !n.read);
  const shown = unread.length > 0 ? unread : aboutIssues.filter((n) => now - n.at < READ_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000);
  const seen = new Set<string>();
  return [...shown]
    .sort((a, b) => b.at - a.at)
    .flatMap((n): Array<Candidate> => {
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
        },
      ];
    });
}

type Ruled = Candidate & { bucket: InboxBucket; reason: string };

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
      bucket: moreUrgent(news.bucket, rest.bucket),
      reason: `${news.reason} · ${rest.reason}`,
    });
  }
  return [...byId.values()];
}

/**
 * ### buildInbox
 *
 * Turns what each source returned into Inbox items, sorted by your rules,
 * then moved where today's Claude review said so.
 *
 * @param moves - Claude's moves by item id, from today's review.
 * @param today - Today in the dashboard's time zone, `YYYY-MM-DD`.
 */
export function buildInbox(
  inputs: InboxInputs,
  rules: InboxRules,
  moves: Record<string, { bucket: InboxBucket; why: string }>,
  now: number,
  today: string,
): Pick<InboxView, "items" | "problems"> {
  const problems: InboxView["problems"] = [];
  const candidates: Array<Candidate> = [];

  for (const question of inputs.questions.filter((q) => q.status === "open")) {
    candidates.push({
      id: `question:${question.id}`,
      source: "agent",
      title: firstLine(question.question),
      subtitle: inputs.agentNames.get(question.agentId),
      at: question.createdAt,
      facts: { kind: "agentQuestion" },
      open: { kind: "inbox", questionId: question.id },
    });
  }

  if (inputs.github instanceof Error) {
    problems.push({ source: "github", message: inputs.github.message });
  } else {
    const { overview, statuses } = inputs.github;
    for (const pr of overview.reviewRequests) {
      const repo = pr.repo ?? overview.repo;
      candidates.push({
        id: `review:${repo}#${pr.number}`,
        source: "github",
        title: pr.title,
        subtitle: `${repo} #${pr.number}${pr.author === undefined ? "" : ` · ${pr.author}`}`,
        at: Date.parse(pr.updatedAt),
        facts: { kind: "reviewRequest" },
        open: { kind: "pr", repo, number: pr.number },
      });
    }
    for (const pr of overview.myPullRequests) {
      const repo = pr.repo ?? overview.repo;
      const status = statuses.get(`${repo}#${pr.number}`);
      candidates.push({
        id: `pr:${repo}#${pr.number}`,
        source: "github",
        title: pr.title,
        subtitle: `${repo} #${pr.number}`,
        at: Date.parse(pr.updatedAt),
        facts: { kind: "myPr", failing: status?.failing ?? false, changesRequested: status?.changesRequested ?? false, draft: pr.isDraft },
        open: { kind: "pr", repo, number: pr.number },
      });
    }
    for (const issue of overview.assignedIssues) {
      const repo = issue.repo ?? overview.repo;
      candidates.push({
        id: `issue:${repo}#${issue.number}`,
        source: "github",
        title: issue.title,
        subtitle: `${repo} #${issue.number}`,
        at: Date.parse(issue.updatedAt),
        facts: { kind: "githubIssue" },
        open: { kind: "url", url: issue.url },
      });
    }
  }

  candidates.push(
    ...fromWidget(inputs.slack, "slack", problems, (item) =>
      item.url === undefined || item.slack === undefined
        ? undefined
        : {
            id: `slack:${item.id}`,
            source: "slack",
            title: item.title,
            subtitle: item.subtitle,
            at: item.at,
            facts: { kind: "slack", reason: item.slack.reason, channel: item.slack.channel } satisfies InboxFacts,
            open: { kind: "slack", url: item.url, title: item.title } satisfies InboxOpen,
          },
    ),
    ...calendarCandidates(widgetItems(inputs.calendar, "calendar", problems), now),
    ...fromWidget(inputs.linear, "linear", problems, (item) => ({
      id: `linear:${item.id}`,
      source: "linear",
      title: item.title,
      subtitle: [item.meta, item.subtitle].filter(Boolean).join(" · ") || undefined,
      at: item.at,
      facts: { kind: "linear", due: item.due, priority: item.priority },
      open: { kind: "issue", issueId: item.id, title: item.title },
    })),
    ...linearNotificationCandidates(inputs.linearNotifications, now),
  );

  const ruled = fold(candidates.map((candidate): Ruled => ({ ...candidate, ...classify(candidate.facts, candidate.at, rules, now, today) })));
  const items = ruled.map((item): InboxItem => {
    const moved = moves[item.id];
    // Claude never brings back what your rules hide.
    return moved !== undefined && item.bucket !== "hidden" && moved.bucket !== item.bucket
      ? { ...item, bucket: moved.bucket, reason: `${moved.why} (Claude; rules: ${item.reason})`, movedBy: "claude" }
      : { ...item, movedBy: undefined };
  });
  // Closest to now first within each bucket (newest past, soonest coming); the browser groups them.
  const distance = (item: InboxItem) => (item.at === undefined ? Infinity : Math.abs(now - item.at));
  items.sort((a, b) => distance(a) - distance(b));
  return { items, problems };
}
