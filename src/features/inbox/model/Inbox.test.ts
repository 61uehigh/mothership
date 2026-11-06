import { describe, expect, it } from "vitest";
import { classify, DEFAULT_INBOX_RULES, inboxGroup, inboxReadKey, isUnread, needsAction, newestFirst, readMarkFor, type InboxFacts, type InboxItem, type InboxReadState, type InboxRules } from "@/features/inbox/model/Inbox";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const TODAY = "2026-11-03";
const HOUR = 60 * 60 * 1000;

function sorted(facts: InboxFacts, at: number | undefined, rules: InboxRules = DEFAULT_INBOX_RULES) {
  return classify(facts, at, rules, NOW, TODAY);
}

describe("classify", () => {
  it("puts review requests, failing PRs, and agent questions in today", () => {
    expect(classify({ kind: "reviewRequest" }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("today");
    expect(classify({ kind: "myPr", failing: true, changesRequested: false, draft: false }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("today");
    expect(classify({ kind: "myPr", failing: false, changesRequested: false, draft: false }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("week");
    expect(sorted({ kind: "myPr", failing: false, changesRequested: true, draft: false }, undefined).reason).toEqual({ code: "my-pr-changes" });
    expect(classify({ kind: "agentQuestion" }, undefined, DEFAULT_INBOX_RULES, NOW, TODAY).bucket).toBe("today");
  });

  it("sorts Slack DMs and mentions by age, each by its own rule", () => {
    const slack = (reason: "dm" | "mention" | "group", channel: string, at: number, rules = DEFAULT_INBOX_RULES) => sorted({ kind: "slack", reason, channel }, at, rules);
    expect(slack("dm", "DM", NOW - 2 * HOUR)).toEqual({ bucket: "today", reason: { code: "slack-dm", hours: 24, recent: true } });
    expect(slack("dm", "DM", NOW - 30 * HOUR)).toEqual({ bucket: "week", reason: { code: "slack-dm", hours: 24, recent: false } });
    expect(slack("mention", "#dev", NOW - 2 * HOUR)).toEqual({ bucket: "today", reason: { code: "slack-mention", channel: "#dev", hours: 24, recent: true } });
    expect(slack("mention", "#dev", NOW - 30 * HOUR)).toEqual({ bucket: "week", reason: { code: "slack-mention", channel: "#dev", hours: 24, recent: false } });
    // @here / @channel stay hidden until you choose a bucket for them.
    expect(slack("group", "#general", NOW - 2 * HOUR).bucket).toBe("hidden");
    expect(slack("group", "#general", NOW - 2 * HOUR, { ...DEFAULT_INBOX_RULES, slackGroupMention: "month" })).toEqual({ bucket: "month", reason: { code: "slack-group", channel: "#general" } });
    // Mentions follow their own rule, not the DM one.
    const rules = { ...DEFAULT_INBOX_RULES, slackRecent: "week" as const, slackMentionRecent: "today" as const };
    expect(slack("dm", "DM", NOW - 2 * HOUR, rules).bucket).toBe("week");
    expect(slack("mention", "#dev", NOW - 2 * HOUR, rules).bucket).toBe("today");
  });

  it("sorts calendar events by day, and invitations waiting for you first", () => {
    const event = (day: string, rsvp?: "needsAction" | "tentative") => sorted({ kind: "event", day, time: "10:00–10:15", rsvp }, undefined);
    expect(event("2026-11-03")).toEqual({ bucket: "today", reason: { code: "event", days: 0, time: "10:00–10:15", rsvp: undefined } });
    expect(event("2026-11-04")).toEqual({ bucket: "week", reason: { code: "event", days: 1, time: "10:00–10:15", rsvp: undefined } });
    expect(event("2026-11-06")).toEqual({ bucket: "week", reason: { code: "event", days: 3, time: "10:00–10:15", rsvp: undefined } });
    expect(event("2026-11-06", "needsAction")).toEqual({ bucket: "today", reason: { code: "event", days: 3, time: "10:00–10:15", rsvp: "needsAction" } });
    expect(event("2026-11-03", "tentative").reason).toEqual({ code: "event", days: 0, time: "10:00–10:15", rsvp: "tentative" });
  });

  it("sorts Linear by due date, then priority", () => {
    const linear = (due: string | undefined, priority: number | undefined) => sorted({ kind: "linear", due, priority }, undefined);
    expect(linear("2026-11-01", 3)).toEqual({ bucket: "today", reason: { code: "linear-overdue", days: 2 } });
    expect(linear("2026-11-03", 4)).toEqual({ bucket: "today", reason: { code: "linear-due-today" } });
    expect(linear(undefined, 1)).toEqual({ bucket: "today", reason: { code: "linear-urgent" } });
    expect(linear("2026-11-06", 4)).toEqual({ bucket: "week", reason: { code: "linear-due-in", days: 3 } });
    expect(linear(undefined, 2)).toEqual({ bucket: "week", reason: { code: "linear-high" } });
    expect(linear("2026-12-01", 3)).toEqual({ bucket: "month", reason: { code: "linear-due-in", days: 28 } });
    expect(linear(undefined, 0)).toEqual({ bucket: "month", reason: { code: "linear-subscribed" } });
  });

  it("follows your rules", () => {
    const rules = { ...DEFAULT_INBOX_RULES, reviewRequest: "week" as const, slackRecentHours: 4 };
    expect(classify({ kind: "reviewRequest" }, undefined, rules, NOW, TODAY).bucket).toBe("week");
    expect(classify({ kind: "slack", reason: "mention", channel: "#dev" }, NOW - 5 * HOUR, rules, NOW, TODAY).bucket).toBe("week");
  });
});

function item(fields: Partial<InboxItem> & Pick<InboxItem, "id">): InboxItem {
  return {
    source: "slack",
    title: fields.id,
    subtitle: undefined,
    at: undefined,
    facts: { kind: "agentQuestion" },
    open: { kind: "url", url: "https://example.com" },
    bucket: "today",
    reason: [],
    movedBy: undefined,
    readKey: fields.id,
    unread: false,
    needsAction: false,
    ...fields,
  };
}

describe("inboxReadKey", () => {
  it("versions GitHub and Linear items by their last update, so news makes them unread again", () => {
    expect(inboxReadKey({ id: "pr:o/r#1", source: "github", at: 100 })).toBe("pr:o/r#1@100");
    expect(inboxReadKey({ id: "linear:DEV-1", source: "linear", at: 200 })).toBe("linear:DEV-1@200");
    expect(inboxReadKey({ id: "linear:DEV-1", source: "linear", at: 300 })).not.toBe(inboxReadKey({ id: "linear:DEV-1", source: "linear", at: 200 }));
  });

  it("keys a Slack message, an event, or a question by its id alone", () => {
    expect(inboxReadKey({ id: "slack:p/1", source: "slack", at: 100 })).toBe("slack:p/1");
    expect(inboxReadKey({ id: "event:e1", source: "calendar", at: 100 })).toBe("event:e1");
    expect(inboxReadKey({ id: "question:q", source: "agent", at: undefined })).toBe("question:q");
  });
});

describe("isUnread", () => {
  const state: InboxReadState = { since: NOW, marks: { "read-key": { read: true, at: NOW }, "unread-key": { read: false, at: NOW } } };

  it("treats everything as read before read tracking starts", () => {
    expect(isUnread({ readKey: "x", at: NOW + HOUR }, undefined)).toBe(false);
  });

  it("starts what came before tracking as read, and what came after as unread", () => {
    expect(isUnread({ readKey: "old", at: NOW - HOUR }, state)).toBe(false);
    expect(isUnread({ readKey: "new", at: NOW + HOUR }, state)).toBe(true);
    expect(isUnread({ readKey: "no-time", at: undefined }, state)).toBe(true);
  });

  it("lets your own mark win over everything", () => {
    expect(isUnread({ readKey: "read-key", at: NOW + HOUR, linearRead: false }, state)).toBe(false);
    expect(isUnread({ readKey: "unread-key", at: NOW - HOUR, linearRead: true }, state)).toBe(true);
  });

  it("follows Linear's read state for a notification you have not marked", () => {
    expect(isUnread({ readKey: "n1", at: NOW + HOUR, linearRead: true }, state)).toBe(false);
    expect(isUnread({ readKey: "n2", at: NOW - HOUR, linearRead: false }, state)).toBe(true);
  });
});

describe("needsAction", () => {
  it("flags what waits on you, and an overdue Linear issue", () => {
    expect(needsAction({ kind: "reviewRequest" }, TODAY)).toBe(true);
    expect(needsAction({ kind: "agentQuestion" }, TODAY)).toBe(true);
    expect(needsAction({ kind: "myPr", failing: true, changesRequested: false, draft: false }, TODAY)).toBe(true);
    expect(needsAction({ kind: "myPr", failing: false, changesRequested: true, draft: false }, TODAY)).toBe(false);
    expect(needsAction({ kind: "event", day: TODAY, time: "10:00–11:00", rsvp: "needsAction" }, TODAY)).toBe(true);
    expect(needsAction({ kind: "event", day: TODAY, time: "10:00–11:00", rsvp: undefined }, TODAY)).toBe(false);
    expect(needsAction({ kind: "linear", due: "2026-11-02", priority: 3 }, TODAY)).toBe(true);
    expect(needsAction({ kind: "linear", due: TODAY, priority: 3 }, TODAY)).toBe(false);
    expect(needsAction({ kind: "slack", reason: "dm", channel: "DM" }, TODAY)).toBe(false);
  });
});

describe("newestFirst", () => {
  it("lists what you see closest to now first, upcoming events by how soon, untimed last, hidden left out", () => {
    const items = [
      item({ id: "hour-ago", at: NOW - HOUR }),
      item({ id: "none" }),
      item({ id: "just-now", at: NOW - 60_000 }),
      item({ id: "hidden", at: NOW, bucket: "hidden" }),
      item({ id: "next-week", at: NOW + 7 * 24 * HOUR, bucket: "week" }),
      item({ id: "in-30-min", at: NOW + HOUR / 2 }),
      item({ id: "yesterday", at: NOW - 24 * HOUR, bucket: "month" }),
    ];
    expect(newestFirst(items, NOW).map((i) => i.id)).toEqual(["just-now", "in-30-min", "hour-ago", "yesterday", "next-week", "none"]);
  });
});

describe("inboxGroup", () => {
  const MONTH_START = Date.parse("2026-11-01T00:00:00Z");
  it("moves this-month items from before the month began to Older", () => {
    expect(inboxGroup({ bucket: "month", at: Date.parse("2024-08-20T00:00:00Z") }, MONTH_START)).toBe("older");
    expect(inboxGroup({ bucket: "month", at: NOW - HOUR }, MONTH_START)).toBe("month");
  });
  it("keeps undated, upcoming, and other buckets where the rules put them", () => {
    expect(inboxGroup({ bucket: "month", at: undefined }, MONTH_START)).toBe("month");
    expect(inboxGroup({ bucket: "month", at: NOW + 20 * 24 * HOUR }, MONTH_START)).toBe("month");
    expect(inboxGroup({ bucket: "week", at: Date.parse("2024-08-20T00:00:00Z") }, MONTH_START)).toBe("week");
    expect(inboxGroup({ bucket: "hidden", at: NOW }, MONTH_START)).toBeUndefined();
  });
});

describe("readMarkFor", () => {
  const item = { readKey: "linear:DEV-1@5", linearUnreadIds: ["n1", "n2"], linearNotificationId: "n2" };

  it("reads every unread Linear notification about the item", () => {
    expect(readMarkFor(item, true)).toEqual({ keys: ["linear:DEV-1@5"], linearIds: ["n1", "n2"] });
  });

  it("unreads only the newest Linear notification", () => {
    expect(readMarkFor(item, false)).toEqual({ keys: ["linear:DEV-1@5"], linearIds: ["n2"] });
  });

  it("sends no Linear ids for an item with no Linear notification", () => {
    const plain = { readKey: "slack:C1/1" };
    expect(readMarkFor(plain, true)).toEqual({ keys: ["slack:C1/1"], linearIds: [] });
    expect(readMarkFor(plain, false)).toEqual({ keys: ["slack:C1/1"], linearIds: [] });
  });
});
