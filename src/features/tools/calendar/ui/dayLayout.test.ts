import { describe, expect, it } from "vitest";
import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import { HOUR_PX, layoutDay, weekStart } from "@/features/tools/calendar/ui/dayLayout";

const ZONE = "UTC";
const DAY = "2026-11-25";

function event(id: string, start: string, end: string): CalendarEventDetail {
  return {
    id,
    title: id,
    start: Date.parse(`${start}Z`),
    end: Date.parse(`${end}Z`),
    allDay: false,
    dates: undefined,
    timeZone: ZONE,
    location: undefined,
    markdown: "",
    url: undefined,
    meetingUrl: undefined,
    meetingName: undefined,
    organizer: undefined,
    attendees: [],
    myResponse: undefined,
    recurring: false,
    status: undefined,
  };
}

const columnsOf = (events: Array<CalendarEventDetail>) =>
  Object.fromEntries(layoutDay(events, DAY, ZONE).map((p) => [p.event.id, `${p.column}/${p.columns}`]));

describe("layoutDay", () => {
  it("puts overlapping events side by side in one cluster", () => {
    const events = [event("a", `${DAY}T09:00`, `${DAY}T10:00`), event("b", `${DAY}T09:30`, `${DAY}T11:00`), event("c", `${DAY}T10:00`, `${DAY}T10:30`)];
    expect(columnsOf(events)).toEqual({ a: "0/2", b: "1/2", c: "0/2" });
  });

  it("starts a new cluster with one column after a gap", () => {
    const events = [event("a", `${DAY}T09:00`, `${DAY}T10:00`), event("b", `${DAY}T09:00`, `${DAY}T10:00`), event("c", `${DAY}T10:00`, `${DAY}T11:00`)];
    expect(columnsOf(events)).toEqual({ a: "0/2", b: "1/2", c: "0/1" });
  });

  it("clips an event that started the day before to the top of the day", () => {
    const [placed] = layoutDay([event("a", "2026-11-24T22:00", `${DAY}T02:00`)], DAY, ZONE);
    expect(placed.top).toBe(0);
    expect(placed.height).toBe(2 * HOUR_PX);
  });

  it("does not show an event ending at exactly midnight on the next day", () => {
    const lateEvening = event("a", "2026-11-24T22:00", `${DAY}T00:00`);
    expect(layoutDay([lateEvening], DAY, ZONE)).toEqual([]);
    expect(layoutDay([lateEvening], "2026-11-24", ZONE)).toHaveLength(1);
  });

  it("gives a zero-length event 15 minutes, so one starting 10 minutes later sits beside it", () => {
    const events = [event("a", `${DAY}T09:00`, `${DAY}T09:00`), event("b", `${DAY}T09:10`, `${DAY}T09:40`)];
    expect(columnsOf(events)).toEqual({ a: "0/2", b: "1/2" });
    expect(columnsOf([event("a", `${DAY}T09:00`, `${DAY}T09:00`), event("b", `${DAY}T09:15`, `${DAY}T09:40`)])).toEqual({ a: "0/1", b: "0/1" });
  });

  it("reads the day in the given zone", () => {
    // 23:30 UTC on the 24th is 08:30 on the 25th in Seoul.
    const [placed] = layoutDay([event("a", "2026-11-24T23:30", "2026-11-25T00:30")], DAY, "Asia/Seoul");
    expect(placed.top).toBe(8.5 * HOUR_PX);
  });
});

describe("weekStart", () => {
  it("goes back to Monday, and a Sunday belongs to the week before", () => {
    expect(weekStart("2026-11-25")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
  });
});
