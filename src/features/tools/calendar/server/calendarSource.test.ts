import { describe, expect, it } from "vitest";
import { parseCalendarEvents } from "@/features/tools/calendar/server/calendarSource";

const NOW = Date.parse("2026-10-23T02:00:00Z");

describe("parseCalendarEvents", () => {
  it("reads an empty day, where the connector leaves out the events list", () => {
    const text = JSON.stringify({ accessRole: "owner", summary: "me@example.com", timeZone: "Asia/Seoul", updated: "2026-10-24T03:01:43Z" });
    expect(parseCalendarEvents(text, "Asia/Seoul", NOW)).toEqual([]);
  });

  it("marks the meeting in progress and the next one", () => {
    const event = (id: string, start: string, end: string) => ({ id, summary: id, start: { dateTime: start }, end: { dateTime: end } });
    const text = JSON.stringify({
      timeZone: "Asia/Seoul",
      events: [event("later", "2026-10-23T05:00:00Z", "2026-10-23T06:00:00Z"), event("now", "2026-10-23T01:30:00Z", "2026-10-23T02:30:00Z")],
    });
    expect(parseCalendarEvents(text, "Asia/Seoul", NOW).map((item) => [item.title, item.badge?.label])).toEqual([
      ["now", "Now"],
      ["later", "Next"],
    ]);
  });

  it("still rejects an answer that is not a calendar list", () => {
    expect(() => parseCalendarEvents(JSON.stringify({ error: "quota exceeded" }), "Asia/Seoul", NOW)).toThrow("Could not parse the calendar response");
  });
});

describe("parseCalendarEvents over the week ahead", () => {
  it("marks today's events for the sidebar and keeps your reply", () => {
    const text = JSON.stringify({
      timeZone: "Asia/Seoul",
      events: [
        { id: "tomorrow", summary: "tomorrow", start: { dateTime: "2026-10-24T01:00:00Z" }, end: { dateTime: "2026-10-24T02:00:00Z" }, attendees: [{ self: true, responseStatus: "needsAction" }] },
        { id: "today", summary: "today", start: { dateTime: "2026-10-23T05:00:00Z" }, end: { dateTime: "2026-10-23T06:00:00Z" }, eventType: "FOCUS_TIME" },
      ],
    });
    expect(parseCalendarEvents(text, "Asia/Seoul", NOW).map((item) => [item.id, item.badge?.label, item.event?.today, item.event?.day, item.event?.eventType, item.event?.myResponse])).toEqual([
      ["today", "Next", true, "2026-10-23", "focustime", undefined],
      // Tomorrow's first meeting is not "Next" in today's list.
      ["tomorrow", undefined, false, "2026-10-24", "default", "needsAction"],
    ]);
  });
});
