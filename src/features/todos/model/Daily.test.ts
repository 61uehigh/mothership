import { describe, expect, it } from "vitest";
import { bucketTodos, doneSuggestions, keepLineBreaks, nextWorkday, planDay, previousWorkday, replan, rollOver, standupText, type ActivityItem } from "@/features/todos/model/Daily";
import type { Todo } from "@/features/todos/model/Todos";

const todo = (id: string, fields: Partial<Todo> = {}): Todo => ({ id, text: id, body: "", done: false, doneDayOnly: false, carryCount: 0, blocked: false, createdAt: 0, ...fields });
// Monday 23 November 2026.
const MONDAY = "2026-11-23";
const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).getTime();

describe("workdays", () => {
  it("skips the weekend both ways", () => {
    expect(nextWorkday("2026-11-20")).toBe(MONDAY);
    expect(nextWorkday(MONDAY)).toBe("2026-11-24");
    expect(previousWorkday(MONDAY)).toBe("2026-11-20");
    expect(previousWorkday("2026-11-24")).toBe(MONDAY);
  });

  it("crosses month and year ends", () => {
    expect(nextWorkday("2026-12-31", new Set())).toBe("2027-01-01");
    expect(previousWorkday("2027-01-01", new Set())).toBe("2026-12-31");
  });

  it("skips Korean public holidays by default", () => {
    // 추석 2026: Thursday 24 to Saturday 26 September.
    expect(previousWorkday("2026-09-28")).toBe("2026-09-23");
    expect(nextWorkday("2026-09-23")).toBe("2026-09-28");
    expect(nextWorkday("2026-12-31")).toBe("2027-01-04");
    expect(previousWorkday("2027-01-04")).toBe("2026-12-31");
  });
});

describe("planDay", () => {
  it("prefers the plan, carries a past one to today, and falls back to the due date", () => {
    expect(planDay({ plannedFor: "2026-11-25", due: "2026-11-24" }, MONDAY)).toBe("2026-11-25");
    expect(planDay({ plannedFor: "2026-11-20" }, MONDAY)).toBe(MONDAY);
    expect(planDay({ due: "2026-11-19" }, MONDAY)).toBe(MONDAY);
    expect(planDay({ due: "2026-11-30" }, MONDAY)).toBe("2026-11-30");
    expect(planDay({}, MONDAY)).toBeUndefined();
  });
});

describe("bucketTodos", () => {
  it("sorts open to-dos by day and done ones by when they were checked off", () => {
    const buckets = bucketTodos(
      [
        todo("today", { plannedFor: MONDAY }),
        todo("carried", { plannedFor: "2026-11-20" }),
        todo("overdue", { due: "2026-11-18" }),
        todo("tomorrow", { plannedFor: "2026-11-24" }),
        todo("later", { plannedFor: "2026-12-01" }),
        todo("someday"),
        todo("done-now", { done: true, doneAt: at(MONDAY) }),
        todo("done-friday", { done: true, doneAt: at("2026-11-20") }),
        todo("done-unknown", { done: true }),
      ],
      MONDAY,
    );
    const ids = (list: Array<Todo>) => list.map((t) => t.id);
    expect(ids(buckets.today)).toEqual(["today", "carried", "overdue"]);
    expect(ids(buckets.next)).toEqual(["tomorrow"]);
    expect(ids(buckets.later)).toEqual(["later"]);
    expect(ids(buckets.someday)).toEqual(["someday"]);
    expect(ids(buckets.doneToday)).toEqual(["done-now"]);
    expect(ids(buckets.doneEarlier)).toEqual(["done-friday", "done-unknown"]);
  });

  it("lists Later soonest first", () => {
    const later = bucketTodos([todo("december", { plannedFor: "2026-12-20" }), todo("due-early", { due: "2026-12-01" }), todo("week", { plannedFor: "2026-11-27" })], MONDAY).later;
    expect(later.map((t) => t.id)).toEqual(["week", "due-early", "december"]);
  });

  it("puts Friday's next workday, Monday, in next", () => {
    expect(bucketTodos([todo("monday", { plannedFor: MONDAY })], "2026-11-20").next).toHaveLength(1);
  });
});

describe("replan", () => {
  it("counts putting off a to-do meant for today or earlier", () => {
    expect(replan(todo("a", { plannedFor: MONDAY }), "2026-11-24", MONDAY)).toEqual({ plannedFor: "2026-11-24", carryCount: 1 });
    expect(replan(todo("a", { plannedFor: "2026-11-20", carryCount: 2 }), null, MONDAY)).toEqual({ plannedFor: undefined, carryCount: 3 });
  });

  it("does not count planning ahead, moving earlier, or a done to-do", () => {
    expect(replan(todo("a"), MONDAY, MONDAY).carryCount).toBe(0);
    expect(replan(todo("a", { plannedFor: "2026-11-27" }), "2026-11-30", MONDAY).carryCount).toBe(0);
    expect(replan(todo("a", { plannedFor: MONDAY }), "2026-11-20", MONDAY).carryCount).toBe(0);
    expect(replan(todo("a", { plannedFor: MONDAY, done: true }), "2026-11-24", MONDAY).carryCount).toBe(0);
  });
});

describe("rollOver", () => {
  it("carries open past plans to today, once each, and leaves the rest", () => {
    const rolled = rollOver(
      [todo("friday", { plannedFor: "2026-11-20", carryCount: 1 }), todo("done", { plannedFor: "2026-11-20", done: true }), todo("today", { plannedFor: MONDAY }), todo("someday")],
      MONDAY,
    );
    expect(rolled?.map((t) => [t.id, t.plannedFor, t.carryCount])).toEqual([
      ["friday", MONDAY, 2],
      ["done", "2026-11-20", 0],
      ["today", MONDAY, 0],
      ["someday", undefined, 0],
    ]);
  });

  it("returns undefined when nothing moved, so nothing is saved", () => {
    expect(rollOver([todo("today", { plannedFor: MONDAY })], MONDAY)).toBeUndefined();
    // Running again the same day is a no-op.
    const once = rollOver([todo("old", { plannedFor: "2026-11-01" })], MONDAY)!;
    expect(rollOver(once, MONDAY)).toBeUndefined();
  });
});

describe("doneSuggestions", () => {
  const activity = (id: string, fields: Partial<ActivityItem>): ActivityItem => ({ id, kind: "session", title: id, detail: undefined, at: 0, url: undefined, ...fields });

  it("offers what is not a to-do yet, a PR once, and no meetings", () => {
    const items = [
      activity("s1", { title: "Fix login" }),
      activity("s2", { title: "rate limit" }),
      activity("o", { kind: "pr-opened", title: "Same day", url: "u1" }),
      activity("m", { kind: "pr-merged", title: "Same day", url: "u1" }),
      activity("o2", { kind: "pr-opened", title: "Still open", url: "u2" }),
      activity("cal", { kind: "meeting", title: "Daily Scrum" }),
    ];
    expect(doneSuggestions(items, new Set(["Fix login"])).map((a) => a.id)).toEqual(["s2", "m", "o2"]);
  });
});

describe("standupText", () => {
  it("lists yesterday's to-dos, today's plan, and blockers", () => {
    const text = standupText({ doneYesterday: [todo("Fix login")], today: [todo("Review PR")], blocked: [] });
    expect(text).toBe(["**어제 한 일**", "- Fix login", "", "**오늘 할 일**", "- Review PR", "", "**막힌 것**", "- 없음"].join("\n"));
  });
});

describe("keepLineBreaks", () => {
  it("keeps single line breaks in prose but leaves code blocks untouched", () => {
    expect(keepLineBreaks("path\nbullet\n\nnext")).toBe("path  \nbullet\n\nnext");
    expect(keepLineBreaks("Run:\n```\ndate -Is\nhostname\n```\nthen")).toBe("Run:\n```\ndate -Is\nhostname\n```\nthen");
    expect(keepLineBreaks("~~~sh\na\nb\n~~~")).toBe("~~~sh\na\nb\n~~~");
  });
});
