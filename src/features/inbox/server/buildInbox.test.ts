import { describe, expect, it } from "vitest";
import { applyReview, buildInbox, calendarCandidates, slackCandidates, linearNotificationCandidates, notificationWhat, type InboxInputs } from "@/features/inbox/server/buildInbox";
import type { LinearNotification } from "@/features/tools/model/Tools";
import { DEFAULT_INBOX_RULES, isUnread, type InboxItem } from "@/features/inbox/model/Inbox";
import type { CalendarItemFacts, WidgetResult } from "@/features/tools/model/Dashboard";
import { makeItem } from "@/features/tools/model/dashboardItem";
import { zonedDate } from "@/lib/dates";


const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-03T03:00:00Z");
const TODAY = "2026-11-03";

function event(id: string, start: number, facts: Partial<CalendarItemFacts>) {
  return makeItem({
    id,
    title: id,
    delegatePrompt: "",
    at: start,
    meta: "12:00–13:00",
    event: { state: "later", day: TODAY, today: true, end: start + HOUR, allDay: false, eventType: "default", series: undefined, myResponse: undefined, ...facts },
  });
}

const NO_GITHUB: InboxInputs["github"] = { overview: { repo: "o/r", reviewRequests: [], myPullRequests: [], assignedIssues: [], runs: [], fetchedAt: NOW }, statuses: new Map() };

const calendar = (items: Array<ReturnType<typeof event>>): WidgetResult => ({ status: "ok", items, notes: [], fetchedAt: NOW });

const onlyCalendar = (result: WidgetResult | undefined): InboxInputs => ({
  questions: [],
  agentNames: new Map(),
  slack: undefined,
  calendar: result,
  linear: undefined,
  linearNotifications: undefined,
  github: NO_GITHUB,
  gmail: undefined,
});

describe("calendarCandidates", () => {
  it("keeps upcoming and running events, and leaves out ended, all-day, and out-of-office ones", () => {
    const result = [
      event("running", NOW - 0.5 * HOUR, {}),
      event("later", NOW + 2 * HOUR, {}),
      event("ended", NOW - 3 * HOUR, {}),
      event("holiday", NOW, { allDay: true }),
      event("ooo", NOW + HOUR, { eventType: "outofoffice" }),
      event("focus", NOW + HOUR, { eventType: "focustime" }),
    ];
    expect(calendarCandidates(result, NOW).map((c) => c.id)).toEqual(["event:running", "event:later"]);
  });

  it("marks invitations you have not answered or said Maybe to", () => {
    const result = [event("new", NOW + HOUR, { myResponse: "needsAction" }), event("maybe", NOW + HOUR, { myResponse: "tentative" }), event("yes", NOW + HOUR, { myResponse: "accepted" })];
    expect(calendarCandidates(result, NOW).map((c) => (c.facts.kind === "event" ? c.facts.rsvp : "?"))).toEqual(["needsAction", "tentative", undefined]);
  });

  it("shows a recurring meeting once, at its next time", () => {
    const result = [
      event("scrum-1", NOW + HOUR, { series: "scrum" }),
      event("scrum-2", NOW + 25 * HOUR, { series: "scrum" }),
      event("scrum-3", NOW + 49 * HOUR, { series: "scrum", myResponse: "needsAction" }),
      event("scrum-4", NOW + 73 * HOUR, { series: "scrum", myResponse: "needsAction" }),
    ];
    expect(calendarCandidates(result, NOW).map((c) => c.id)).toEqual(["event:scrum-1", "event:scrum-3"]);
  });

  it("shows a failed or unset calendar as a problem, like Slack and Linear", () => {
    expect(buildInbox(onlyCalendar({ status: "error", message: "Calendar API not enabled", fetchedAt: NOW }), DEFAULT_INBOX_RULES, NOW, TODAY)).toEqual({
      items: [],
      problems: [{ source: "calendar", message: "Calendar API not enabled" }],
    });
    expect(buildInbox(onlyCalendar({ status: "unavailable", reason: { code: "not-connected" }, fetchedAt: NOW }), DEFAULT_INBOX_RULES, NOW, TODAY).problems).toEqual([
      { source: "calendar", unavailable: { code: "not-connected" } },
    ]);
    expect(buildInbox(onlyCalendar(undefined), DEFAULT_INBOX_RULES, NOW, TODAY)).toEqual({ items: [], problems: [] });
  });

  it("opens the event tab and sorts by the rules", () => {
    const inputs: InboxInputs = {
      questions: [],
      agentNames: new Map(),
      slack: undefined,
      calendar: calendar([event("soon", NOW + HOUR, {}), event("thursday", NOW + 50 * HOUR, { day: "2026-11-05", today: false, myResponse: "needsAction" }), event("friday", NOW + 74 * HOUR, { day: "2026-11-06", today: false })]),
      linear: undefined,
      linearNotifications: undefined,
      github: NO_GITHUB,
      gmail: undefined,
    };
    const { items } = buildInbox(inputs, DEFAULT_INBOX_RULES, NOW, TODAY);
    // Soonest first.
    expect(items.map((i) => [i.id, i.bucket, i.reason])).toEqual([
      ["event:soon", "today", [{ code: "event", days: 0, time: "12:00–13:00", rsvp: undefined }]],
      ["event:thursday", "today", [{ code: "event", days: 2, time: "12:00–13:00", rsvp: "needsAction" }]],
      ["event:friday", "week", [{ code: "event", days: 3, time: "12:00–13:00", rsvp: undefined }]],
    ]);
    expect(items[0].open).toEqual({ kind: "event", eventId: "soon", title: "soon" });
  });

  it("labels an event Today when today comes from the calendar's zone, not the Mac's", () => {
    // 00:30 in Seoul (the calendar's zone), still Nov 3 on a Mac in Los Angeles.
    const now = Date.parse("2026-11-03T15:30:00Z");
    const inputs = onlyCalendar(calendar([event("standup", now + HOUR, { day: zonedDate(now + HOUR, "Asia/Seoul") })]));
    const daysAway = (today: string) => buildInbox(inputs, DEFAULT_INBOX_RULES, now, today).items[0].reason[0];
    expect(daysAway(zonedDate(now, "Asia/Seoul"))).toMatchObject({ code: "event", days: 0 });
    expect(daysAway(zonedDate(now, "America/Los_Angeles"))).toMatchObject({ code: "event", days: 1 });
  });
});

function notification(fields: Partial<LinearNotification> & Pick<LinearNotification, "id" | "type">): LinearNotification {
  return { title: "LTE data", subtitle: "", issueId: "DEV-1", url: "https://linear.app/x/issue/DEV-1/lte", at: NOW - HOUR, read: false, ...fields };
}

describe("Linear notifications", () => {
  it("says what happened in a few words", () => {
    expect(notificationWhat(notification({ id: "1", type: "issueCommentMention", subtitle: "Kim mentioned you: look" }))).toEqual({ what: { kind: "mentioned", issue: "DEV-1" }, direct: true });
    expect(notificationWhat(notification({ id: "2", type: "issueAssignedToYou" }))).toEqual({ what: { kind: "assigned", issue: "DEV-1" }, direct: true });
    expect(notificationWhat(notification({ id: "3", type: "issueNewComment" }))).toEqual({ what: { kind: "commented", issue: "DEV-1" }, direct: false });
    expect(notificationWhat(notification({ id: "4", type: "issueStatusChanged", subtitle: "Moved to In Review by Kim" }))).toEqual({ what: { kind: "changed", change: "Moved to In Review", issue: "DEV-1" }, direct: false });
    expect(notificationWhat(notification({ id: "5", type: "issueEmojiReaction" }))).toEqual({ what: { kind: "reacted", issue: "DEV-1" }, direct: false });
  });

  it("shows unread ones about issues, the newest per issue, and no pull request ones", () => {
    const list = [
      notification({ id: "new", type: "issueNewComment", at: NOW - HOUR }),
      notification({ id: "old", type: "issueStatusChanged", at: NOW - 2 * HOUR }),
      notification({ id: "read", type: "issueNewComment", issueId: "DEV-2", read: true }),
      notification({ id: "pr", type: "pullRequestCommented", issueId: undefined, url: "https://linear.app/x/review/pr" }),
    ];
    expect(linearNotificationCandidates(list, NOW).map((c) => [c.id, c.facts.kind === "linearNotification" ? c.facts.what : ""])).toEqual([["linear:DEV-1", { kind: "commented", issue: "DEV-1" }]]);
  });

  it("falls back to the last 3 days when nothing is unread", () => {
    const list = [notification({ id: "a", type: "issueNewComment", read: true }), notification({ id: "b", type: "issueNewComment", issueId: "DEV-2", read: true, at: NOW - 100 * HOUR })];
    expect(linearNotificationCandidates(list, NOW).map((c) => c.id)).toEqual(["linear:DEV-1"]);
  });

  it("buckets mentions today, other news this week, and older ones this month", () => {
    const inputs = (n: LinearNotification): InboxInputs => ({ questions: [], agentNames: new Map(), slack: undefined, calendar: undefined, linear: undefined, linearNotifications: [n], github: NO_GITHUB, gmail: undefined });
    const first = (n: LinearNotification) => buildInbox(inputs(n), DEFAULT_INBOX_RULES, NOW, TODAY).items[0];
    expect([first(notification({ id: "m", type: "issueCommentMention" })).bucket, first(notification({ id: "c", type: "issueNewComment" })).bucket]).toEqual(["today", "week"]);
    const older = first(notification({ id: "o", type: "issueAssignedToYou", at: NOW - 30 * HOUR }));
    expect([older.bucket, older.reason]).toEqual(["month", [{ code: "linear-notification", what: { kind: "assigned", issue: "DEV-1" }, olderThanHours: 24 }]]);
  });

  it("folds a notification into the issue it is about", () => {
    const issue = makeItem({ id: "DEV-1", title: "LTE data", delegatePrompt: "", at: NOW - 5 * HOUR, due: "2026-11-30", priority: 3 });
    const inputs: InboxInputs = {
      questions: [],
      agentNames: new Map(),
      slack: undefined,
      calendar: undefined,
      linear: { status: "ok", items: [issue], notes: [], fetchedAt: NOW },
      linearNotifications: [notification({ id: "m", type: "issueCommentMention", subtitle: "Kim mentioned you: look" })],
      github: NO_GITHUB,
      gmail: undefined,
    };
    const { items } = buildInbox(inputs, DEFAULT_INBOX_RULES, NOW, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toEqual([
      { code: "linear-notification", what: { kind: "mentioned", issue: "DEV-1" }, olderThanHours: undefined },
      { code: "linear-due-in", days: 27 },
    ]);
    expect(items[0]).toMatchObject({
      id: "linear:DEV-1",
      bucket: "today",
      subtitle: "DEV-1 · Kim mentioned you: look",
      at: NOW - HOUR,
      open: { kind: "issue", issueId: "DEV-1", title: "LTE data" },
    });
  });

  it("keys read marks by the issue's newest news, and shows Linear's read state until you mark it", () => {
    const issue = makeItem({ id: "DEV-1", title: "LTE data", delegatePrompt: "", at: NOW - 5 * HOUR });
    const inputs = (read: boolean): InboxInputs => ({
      questions: [],
      agentNames: new Map(),
      slack: undefined,
      calendar: undefined,
      linear: { status: "ok", items: [issue], notes: [], fetchedAt: NOW },
      linearNotifications: [notification({ id: "m", type: "issueNewComment", read })],
      github: NO_GITHUB,
      gmail: undefined,
    });
    const since = NOW - 10 * HOUR;
    const unreadInLinear = buildInbox(inputs(false), DEFAULT_INBOX_RULES, NOW, TODAY).items[0];
    expect(unreadInLinear).toMatchObject({ readKey: `linear:DEV-1@${NOW - HOUR}`, linearRead: false });
    expect(isUnread(unreadInLinear, { since, marks: {} })).toBe(true);
    expect(isUnread(buildInbox(inputs(true), DEFAULT_INBOX_RULES, NOW, TODAY).items[0], { since, marks: {} })).toBe(false);
    // Read in mothership: stays read though Linear still says unread.
    expect(isUnread(unreadInLinear, { since, marks: { [unreadInLinear.readKey]: { read: true, at: NOW } } })).toBe(false);
  });

  it("carries every unread notification about an issue, so opening it reads them all in Linear", () => {
    const list = [
      notification({ id: "newest", type: "issueNewComment", at: NOW - HOUR }),
      notification({ id: "older", type: "issueStatusChanged", at: NOW - 2 * HOUR }),
      notification({ id: "read", type: "issueNewComment", at: NOW - 3 * HOUR, read: true }),
      notification({ id: "other", type: "issueNewComment", issueId: "DEV-2" }),
    ];
    expect(linearNotificationCandidates(list, NOW).map((c) => [c.id, c.linearUnreadIds, c.linearNotificationId])).toEqual([
      ["linear:DEV-1", ["newest", "older"], "newest"],
      ["linear:DEV-2", ["other"], "other"],
    ]);
  });
});

describe("Gmail", () => {
  const mail = (id: string, fields: { unread?: boolean; important?: boolean; hoursAgo?: number }) => ({
    id,
    threadId: `${id}-t`,
    from: "Kim",
    fromEmail: "kim@example.com",
    subject: `Subject ${id}`,
    snippet: "",
    at: NOW - (fields.hoursAgo ?? 1) * HOUR,
    unread: fields.unread ?? true,
    important: fields.important ?? false,
  });
  const inputs = (gmail: InboxInputs["gmail"]): InboxInputs => ({ ...onlyCalendar(undefined), gmail });

  it("lists unread mail, important today and the rest this week, opening its mail tab", () => {
    const { items } = buildInbox(inputs({ messages: [mail("a", { important: true }), mail("b", { hoursAgo: 2 }), mail("c", { unread: false })], email: "me@example.com" }), DEFAULT_INBOX_RULES, NOW, TODAY);
    expect(items.map((i) => [i.id, i.bucket, i.reason, i.subtitle])).toEqual([
      ["gmail:a", "today", [{ code: "mail-important" }], "Kim"],
      ["gmail:b", "week", [{ code: "mail-unread" }], "Kim"],
    ]);
    expect(items[0].open).toEqual({ kind: "mail", messageId: "a", title: "Subject a" });
    expect(items[0].readKey).toBe("gmail:a");
  });

  it("shows a Gmail that cannot be read as a problem, and one not signed in as nothing", () => {
    expect(buildInbox(inputs(new Error("Gmail API not enabled")), DEFAULT_INBOX_RULES, NOW, TODAY)).toEqual({ items: [], problems: [{ source: "gmail", message: "Gmail API not enabled" }] });
    expect(buildInbox(inputs(undefined), DEFAULT_INBOX_RULES, NOW, TODAY)).toEqual({ items: [], problems: [] });
  });
});

describe("slackCandidates", () => {
  const dm = (id: string, at: number, conversation: string | undefined, reason: "dm" | "mention" | "group" = "dm") =>
    makeItem({ id, title: id, delegatePrompt: "", at, url: `https://x.slack.com/${id}`, subtitle: "YEGYEOL KIM · DM", slack: { reason, channel: "DM", conversation, ts: `${at}.000000` } });

  it("shows one row per conversation: its newest message, with the count", () => {
    const rows = slackCandidates([dm("a", 1, "D1"), dm("c", 3, "D1"), dm("b", 2, "D1"), dm("other", 4, "D2")]);
    expect(rows.map((r) => [r.id, r.title, r.count, r.subtitle, r.at])).toEqual([
      ["slack:c", "c", 3, "YEGYEOL KIM · DM", 3],
      ["slack:other", "other", undefined, "YEGYEOL KIM · DM", 4],
    ]);
    // Opening the group shows the conversation from its oldest message; a single message opens as before.
    expect(rows[0].open).toEqual({ kind: "slack", url: "https://x.slack.com/c", title: "c", since: "1.000000" });
    expect(rows[1].open).toEqual({ kind: "slack", url: "https://x.slack.com/other", title: "other" });
  });

  it("keeps a message of unknown conversation on its own, and the most direct reason for a group", () => {
    expect(slackCandidates([dm("a", 1, undefined), dm("b", 2, undefined)]).map((r) => r.id)).toEqual(["slack:a", "slack:b"]);
    const [row] = slackCandidates([dm("old", 1, "C1:1.2", "mention"), dm("new", 2, "C1:1.2", "group")]);
    expect(row.facts).toEqual({ kind: "slack", reason: "mention", channel: "DM" });
    // A thread opens whole anyway.
    expect(row.open).toEqual({ kind: "slack", url: "https://x.slack.com/new", title: "new" });
  });
});

describe("applyReview", () => {
  const ruled = (id: string, bucket: InboxItem["bucket"]): InboxItem => ({
    id,
    source: "github",
    title: id,
    subtitle: undefined,
    at: NOW,
    facts: { kind: "githubIssue" },
    open: { kind: "url", url: "https://example.com" },
    bucket,
    reason: [{ code: "github-issue" }],
    movedBy: undefined,
    readKey: id,
    unread: false,
    needsAction: false,
  });

  it("moves what Claude moved, with its words, but never brings back what your rules hide", () => {
    const moves = { a: { bucket: "today" as const, why: "Blocks a release" }, hidden: { bucket: "today" as const, why: "Looks urgent" }, same: { bucket: "week" as const, why: "No change" } };
    const items = applyReview([ruled("a", "month"), ruled("hidden", "hidden"), ruled("same", "week")], moves);
    expect(items.map((i) => [i.id, i.bucket, i.movedBy, i.why])).toEqual([
      ["a", "today", "claude", "Blocks a release"],
      ["hidden", "hidden", undefined, undefined],
      ["same", "week", undefined, undefined],
    ]);
  });
});
