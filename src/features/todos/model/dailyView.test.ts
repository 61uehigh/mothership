import { describe, expect, it } from "vitest";
import type { InboxItem } from "@/features/inbox/model/Inbox";
import type { ActivityItem } from "@/features/todos/model/Daily";
import { dailyView } from "@/features/todos/model/dailyView";
import type { Todo } from "@/features/todos/model/Todos";

const todo = (id: string, fields: Partial<Todo> = {}): Todo => ({ id, text: id, body: "", done: false, doneDayOnly: false, carryCount: 0, blocked: false, createdAt: 0, ...fields });
const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).getTime();
const inbox = (id: string, fields: Partial<InboxItem>) => ({ id, source: "github", title: id, bucket: "today", ...fields }) as InboxItem;
const activity = (id: string, fields: Partial<ActivityItem> = {}): ActivityItem => ({ id, kind: "pr-merged", title: id, detail: undefined, at: at(MONDAY), url: undefined, ...fields });
// Monday 23 November 2026; the previous workday is Friday the 20th.
const MONDAY = "2026-11-23";
const TUESDAY = "2026-11-24";

describe("dailyView", () => {
  it("shows a later day's plan and its next workday's, but no plan for a past day", () => {
    const todos = [todo("a", { plannedFor: TUESDAY }), todo("b", { plannedFor: "2026-11-25" }), todo("c")];
    const tuesday = dailyView(todos, [], [], TUESDAY, MONDAY);
    expect(tuesday.plan.map((t) => t.id)).toEqual(["a"]);
    expect(tuesday.nextPlan.map((t) => t.id)).toEqual(["b"]);
    expect(tuesday.somedaySuggestions.map((t) => t.id)).toEqual(["c"]);
    expect(dailyView(todos, [], [], "2026-11-20", MONDAY)).toMatchObject({ isPast: true, somedaySuggestions: [] });
  });

  it("lists the day's done to-dos in the order they were done", () => {
    const todos = [todo("late", { done: true, doneAt: at(MONDAY, 15) }), todo("early", { done: true, doneAt: at(MONDAY, 9) }), todo("other day", { done: true, doneAt: at(TUESDAY) })];
    expect(dailyView(todos, [], [], MONDAY, MONDAY).done.map((t) => t.id)).toEqual(["early", "late"]);
  });

  it("suggests today's GitHub and Linear Inbox items that are not open to-dos yet, and only for today", () => {
    const items = [inbox("review", {}), inbox("issue", { source: "linear" }), inbox("dm", { source: "slack" }), inbox("next week", { bucket: "week" }), inbox("planned", {})];
    const todos = [todo("planned")];
    expect(dailyView(todos, [], items, MONDAY, MONDAY).inboxSuggestions.map((i) => i.id)).toEqual(["review", "issue"]);
    expect(dailyView(todos, [], items, TUESDAY, MONDAY).inboxSuggestions).toEqual([]);
  });

  it("splits meetings from the tools' activity and leaves out what is already a to-do", () => {
    const view = dailyView([todo("merged fix", { done: true, doneAt: at(MONDAY) })], [activity("standup", { kind: "meeting" }), activity("merged fix", { url: "u1" }), activity("new pr", { kind: "pr-opened", url: "u2" })], [], MONDAY, MONDAY);
    expect(view.meetings.map((m) => m.id)).toEqual(["standup"]);
    expect(view.fromTools.map((m) => m.id)).toEqual(["new pr"]);
  });

  it("puts the previous workday's done to-dos and the blocked ones in the standup", () => {
    const todos = [todo("friday work", { done: true, doneAt: at("2026-11-20") }), todo("stuck", { blocked: true }), todo("today's", { plannedFor: MONDAY })];
    expect(dailyView(todos, [], [], MONDAY, MONDAY).standup).toBe(["**어제 한 일**", "- friday work", "", "**오늘 할 일**", "- today's", "", "**막힌 것**", "- stuck"].join("\n"));
  });
});
