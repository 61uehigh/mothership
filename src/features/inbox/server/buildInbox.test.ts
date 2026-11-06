import { describe, expect, it } from "vitest";
import { buildInbox, calendarCandidates, linearNotificationCandidates, notificationWhat, type InboxInputs } from "@/features/inbox/server/buildInbox";
import type { LinearNotification } from "@/features/tools/model/Tools";
import { DEFAULT_INBOX_RULES } from "@/features/inbox/model/Inbox";
import type { CalendarItemFacts, WidgetResult } from "@/features/tools/model/Dashboard";
import { makeItem } from "@/features/tools/model/dashboardItem";
import { zonedDate } from "@/features/tools/server/sourceUtils";

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
    event: { day: TODAY, today: true, end: start + HOUR, allDay: false, eventType: "default", series: undefined, myResponse: undefined, ...facts },
  });
}

const NO_GITHUB: InboxInputs["github"] = { overview: { repo: "o/r", reviewRequests: [], myPullRequests: [], assignedIssues: [], runs: [], fetchedAt: NOW }, statuses: new Map() };

const calendar = (items: Array<ReturnType<typeof event>>): WidgetResult => ({ status: "ok", items, note: undefined, fetchedAt: NOW });

const onlyCalendar = (result: WidgetResult | undefined): InboxInputs => ({
  questions: [],
  agentNames: new Map(),
  slack: undefined,
  calendar: result,
  linear: undefined,
  linearNotifications: undefined,
  github: NO_GITHUB,
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
    expect(buildInbox(onlyCalendar({ status: "error", message: "Calendar API not enabled", fetchedAt: NOW }), DEFAULT_INBOX_RULES, {}, NOW, TODAY)).toEqual({
      items: [],
      problems: [{ source: "calendar", message: "Calendar API not enabled" }],
    });
    expect(buildInbox(onlyCalendar({ status: "unavailable", reason: "Not connected", fetchedAt: NOW }), DEFAULT_INBOX_RULES, {}, NOW, TODAY).problems).toEqual([
      { source: "calendar", message: "Not connected" },
    ]);
    expect(buildInbox(onlyCalendar(undefined), DEFAULT_INBOX_RULES, {}, NOW, TODAY)).toEqual({ items: [], problems: [] });
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
    };
    const { items } = buildInbox(inputs, DEFAULT_INBOX_RULES, {}, NOW, TODAY);
    // Soonest first.
    expect(items.map((i) => [i.id, i.bucket, i.reason])).toEqual([
      ["event:soon", "today", "Today 12:00–13:00"],
      ["event:thursday", "today", "Needs your RSVP, In 2 days, 12:00–13:00"],
      ["event:friday", "week", "In 3 days, 12:00–13:00"],
    ]);
    expect(items[0].open).toEqual({ kind: "event", eventId: "soon", title: "soon" });
  });

  it("labels an event Today when today comes from the calendar's zone, not the Mac's", () => {
    // 00:30 in Seoul (the calendar's zone), still Nov 3 on a Mac in Los Angeles.
    const now = Date.parse("2026-11-03T15:30:00Z");
    const inputs = onlyCalendar(calendar([event("standup", now + HOUR, { day: zonedDate(now + HOUR, "Asia/Seoul") })]));
    const reason = (today: string) => buildInbox(inputs, DEFAULT_INBOX_RULES, {}, now, today).items[0].reason;
    expect(reason(zonedDate(now, "Asia/Seoul"))).toBe("Today 12:00–13:00");
    expect(reason(zonedDate(now, "America/Los_Angeles"))).toBe("Tomorrow 12:00–13:00");
  });
});

function notification(fields: Partial<LinearNotification> & Pick<LinearNotification, "id" | "type">): LinearNotification {
  return { title: "LTE data", subtitle: "", issueId: "DEV-1", url: "https://linear.app/x/issue/DEV-1/lte", at: NOW - HOUR, read: false, ...fields };
}

describe("Linear notifications", () => {
  it("says what happened in a few words", () => {
    expect(notificationWhat(notification({ id: "1", type: "issueCommentMention", subtitle: "Kim mentioned you: look" }))).toEqual({ what: "Mentioned you on DEV-1", direct: true });
    expect(notificationWhat(notification({ id: "2", type: "issueAssignedToYou" }))).toEqual({ what: "Assigned to you: DEV-1", direct: true });
    expect(notificationWhat(notification({ id: "3", type: "issueNewComment" }))).toEqual({ what: "Commented on DEV-1", direct: false });
    expect(notificationWhat(notification({ id: "4", type: "issueStatusChanged", subtitle: "Moved to In Review by Kim" }))).toEqual({ what: "Moved to In Review: DEV-1", direct: false });
    expect(notificationWhat(notification({ id: "5", type: "issueEmojiReaction" }))).toEqual({ what: "Reacted on DEV-1", direct: false });
  });

  it("shows unread ones about issues, the newest per issue, and no pull request ones", () => {
    const list = [
      notification({ id: "new", type: "issueNewComment", at: NOW - HOUR }),
      notification({ id: "old", type: "issueStatusChanged", at: NOW - 2 * HOUR }),
      notification({ id: "read", type: "issueNewComment", issueId: "DEV-2", read: true }),
      notification({ id: "pr", type: "pullRequestCommented", issueId: undefined, url: "https://linear.app/x/review/pr" }),
    ];
    expect(linearNotificationCandidates(list, NOW).map((c) => [c.id, c.facts.kind === "linearNotification" ? c.facts.what : ""])).toEqual([["linear:DEV-1", "Commented on DEV-1"]]);
  });

  it("falls back to the last 3 days when nothing is unread", () => {
    const list = [notification({ id: "a", type: "issueNewComment", read: true }), notification({ id: "b", type: "issueNewComment", issueId: "DEV-2", read: true, at: NOW - 100 * HOUR })];
    expect(linearNotificationCandidates(list, NOW).map((c) => c.id)).toEqual(["linear:DEV-1"]);
  });

  it("buckets mentions today, other news this week, and older ones this month", () => {
    const inputs = (n: LinearNotification): InboxInputs => ({ questions: [], agentNames: new Map(), slack: undefined, calendar: undefined, linear: undefined, linearNotifications: [n], github: NO_GITHUB });
    const first = (n: LinearNotification) => buildInbox(inputs(n), DEFAULT_INBOX_RULES, {}, NOW, TODAY).items[0];
    expect([first(notification({ id: "m", type: "issueCommentMention" })).bucket, first(notification({ id: "c", type: "issueNewComment" })).bucket]).toEqual(["today", "week"]);
    expect(first(notification({ id: "o", type: "issueAssignedToYou", at: NOW - 30 * HOUR }))).toMatchObject({ bucket: "month", reason: "Assigned to you: DEV-1, older than 24h" });
  });

  it("folds a notification into the issue it is about", () => {
    const issue = makeItem({ id: "DEV-1", title: "LTE data", delegatePrompt: "", at: NOW - 5 * HOUR, due: "2026-11-30", priority: 3 });
    const inputs: InboxInputs = {
      questions: [],
      agentNames: new Map(),
      slack: undefined,
      calendar: undefined,
      linear: { status: "ok", items: [issue], note: undefined, fetchedAt: NOW },
      linearNotifications: [notification({ id: "m", type: "issueCommentMention", subtitle: "Kim mentioned you: look" })],
      github: NO_GITHUB,
    };
    const { items } = buildInbox(inputs, DEFAULT_INBOX_RULES, {}, NOW, TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "linear:DEV-1",
      bucket: "today",
      reason: "Mentioned you on DEV-1 · Due in 27 days",
      subtitle: "DEV-1 · Kim mentioned you: look",
      at: NOW - HOUR,
      open: { kind: "issue", issueId: "DEV-1", title: "LTE data" },
    });
  });
});
