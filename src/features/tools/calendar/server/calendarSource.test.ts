import { describe, expect, it } from "vitest";
import { fetchCalendarAhead, parseCalendarEvents } from "@/features/tools/calendar/server/calendarSource";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

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
    expect(parseCalendarEvents(text, "Asia/Seoul", NOW).map((item) => [item.title, item.event?.state])).toEqual([
      ["now", "now"],
      ["later", "next"],
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
    expect(parseCalendarEvents(text, "Asia/Seoul", NOW).map((item) => [item.id, item.event?.state, item.event?.today, item.event?.day, item.event?.eventType, item.event?.myResponse])).toEqual([
      ["today", "next", true, "2026-10-23", "focustime", undefined],
      // Tomorrow's first meeting is not "Next" in today's list.
      ["tomorrow", "later", false, "2026-10-24", "default", "needsAction"],
    ]);
  });

  it("counts an event that started before today and is still going as today's", () => {
    const text = JSON.stringify({
      timeZone: "Asia/Seoul",
      events: [
        { id: "trip", summary: "trip", start: { date: "2026-10-22" }, end: { date: "2026-10-25" } },
        { id: "late", summary: "late", start: { dateTime: "2026-10-22T14:30:00Z" }, end: { dateTime: "2026-10-23T03:00:00Z" } },
        { id: "yesterday", summary: "yesterday", start: { date: "2026-10-22" }, end: { date: "2026-10-23" } },
      ],
    });
    expect(parseCalendarEvents(text, "Asia/Seoul", NOW).map((item) => [item.id, item.event?.today, item.event?.day, item.event?.state])).toEqual([
      ["trip", true, "2026-10-22", "later"],
      ["yesterday", false, "2026-10-22", "past"],
      ["late", true, "2026-10-22", "now"],
    ]);
  });
});

describe("fetchCalendarAhead on the claude.ai connector", () => {
  it("reads every configured calendar and follows the next pages", async () => {
    const event = (id: string) => ({ id, summary: id, start: { dateTime: "2026-10-23T05:00:00Z" }, end: { dateTime: "2026-10-23T06:00:00Z" } });
    const calls: Array<Record<string, unknown>> = [];
    const caller: ToolCaller = {
      label: "connector:Google Calendar",
      describe: async () => undefined,
      callText: async (_tool, args) => {
        calls.push(args);
        if (args.calendarId === "team@example.com") return JSON.stringify({ timeZone: "Asia/Seoul", events: [event("team"), event("shared")] });
        if (args.pageToken === undefined) return JSON.stringify({ timeZone: "Asia/Seoul", events: [event("mine"), event("shared")], nextPageToken: "p2" });
        return JSON.stringify({ timeZone: "Asia/Seoul", events: [event("page2")] });
      },
    };
    const items = await fetchCalendarAhead(caller, { calendars: ["primary", "team@example.com"], timeZone: "Asia/Seoul", flavor: "google" }, NOW);
    expect(items.map((item) => item.id).sort()).toEqual(["mine", "page2", "shared", "team"]);
    expect(calls).toHaveLength(3);
  });
});
