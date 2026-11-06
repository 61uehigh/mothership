import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCalendarEvent, htmlToMarkdown } from "@/features/tools/calendar/server/calendarEvent";
import type { CalendarFlavor } from "@/features/tools/calendar/server/calendarSource";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

describe("htmlToMarkdown", () => {
  it("converts Google's description HTML", () => {
    expect(htmlToMarkdown('Agenda<br><b>Bring</b> <a href="https://a.example">notes</a> &amp; laptops')).toBe(
      "Agenda  \n**Bring** [notes](https://a.example) & laptops",
    );
  });
});

// Shapes captured from cocal 2.7 `get-event` and the claude.ai connector's `get_event`, with names, ids and links replaced.

/** cocal wraps the event as `{ event }` and passes Google's `conferenceData` through. */
const COCAL_RECURRING_INSTANCE = {
  event: {
    id: "series1_20261123T003000Z",
    summary: "Team Weekly",
    location: "Room 1",
    start: { dateTime: "2026-11-23T09:30:00+09:00", timeZone: "Asia/Seoul" },
    end: { dateTime: "2026-11-23T10:30:00+09:00", timeZone: "Asia/Seoul" },
    startDayOfWeek: "Monday",
    endDayOfWeek: "Monday",
    status: "confirmed",
    htmlLink: "https://www.google.com/calendar/event?eid=example",
    created: "2026-07-23T02:41:42Z",
    updated: "2026-11-17T06:03:30Z",
    creator: { email: "creator@example.com" },
    organizer: { email: "team@group.calendar.google.com", displayName: "Team" },
    attendees: [
      { email: "room@resource.calendar.google.com", displayName: "Room 1", responseStatus: "accepted", resource: true },
      { email: "team@example.com", displayName: "Team", responseStatus: "needsAction" },
      { email: "me@example.com", responseStatus: "accepted", self: true },
    ],
    recurringEventId: "series1_R20260831T003000",
    originalStartTime: { dateTime: "2026-11-23T09:30:00+09:00", timeZone: "Asia/Seoul" },
    iCalUID: "series1@google.com",
    sequence: 0,
    reminders: { useDefault: true },
    eventType: "default",
    conferenceData: {
      entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/aaa-bbbb-ccc" }],
      conferenceSolution: { key: { type: "hangoutsMeet" }, name: "Google Meet" },
      conferenceId: "aaa-bbbb-ccc",
    },
    hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
    calendarId: "primary",
    accountId: "work",
  },
};

/** The connector sends the event bare and flattens the meeting to `conferenceUrl` and `solutionName`. */
const CONNECTOR_EVENT = {
  id: "plain1",
  summary: "1:1",
  description: "Agenda<br>Notes",
  start: { dateTime: "2026-11-24T14:00:00+09:00", timeZone: "Asia/Seoul" },
  end: { dateTime: "2026-11-24T14:30:00+09:00", timeZone: "Asia/Seoul" },
  status: "confirmed",
  eventType: "DEFAULT",
  htmlLink: "https://www.google.com/calendar/event?eid=plain",
  conferenceUrl: "https://meet.google.com/ddd-eeee-fff",
  conferenceData: { solutionName: "Google Meet", videoEntryPoint: { uri: "https://meet.google.com/ddd-eeee-fff" } },
  organizer: { email: "lead@example.com", displayName: "Lead" },
  attendees: [{ email: "me@example.com", responseStatus: "tentative", self: true }],
  useDefaultReminders: true,
};

const ALL_DAY_EVENT = {
  event: {
    id: "allday1",
    summary: "Holiday",
    start: { date: "2026-12-25" },
    end: { date: "2026-12-26" },
    eventType: "outOfOffice",
  },
};

const MINIMAL_EVENT = { id: "min1", start: { dateTime: "2026-11-25T10:00:00Z" } };

function callerAnswering(answer: unknown): ToolCaller & { calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    label: "calendar",
    calls,
    callText: async (tool, args) => {
      calls.push([tool, args]);
      return typeof answer === "string" ? answer : JSON.stringify(answer);
    },
    describe: async () => undefined,
  };
}

const options = (flavor: CalendarFlavor) => ({ flavor, calendarId: "primary", timeZone: "Asia/Seoul" });

describe("fetchCalendarEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads cocal's wrapped recurring instance", async () => {
    const caller = callerAnswering(COCAL_RECURRING_INSTANCE);
    const event = await fetchCalendarEvent(caller, options("cocal"), "series1_20261123T003000Z");
    expect(caller.calls).toEqual([["get-event", { calendarId: "primary", eventId: "series1_20261123T003000Z" }]]);
    expect(event).toMatchObject({
      id: "series1_20261123T003000Z",
      title: "Team Weekly",
      start: Date.parse("2026-11-23T00:30:00Z"),
      end: Date.parse("2026-11-23T01:30:00Z"),
      allDay: false,
      timeZone: "Asia/Seoul",
      location: "Room 1",
      meetingUrl: "https://meet.google.com/aaa-bbbb-ccc",
      meetingName: "Google Meet",
      organizer: "Team",
      myResponse: "accepted",
      recurring: true,
      status: "confirmed",
    });
    expect(event.attendees).toHaveLength(3);
  });

  it("reads the connector's bare event", async () => {
    const caller = callerAnswering(CONNECTOR_EVENT);
    const event = await fetchCalendarEvent(caller, options("google"), "plain1");
    expect(caller.calls).toEqual([["get_event", { eventId: "plain1" }]]);
    expect(event).toMatchObject({
      title: "1:1",
      markdown: "Agenda  \nNotes",
      meetingUrl: "https://meet.google.com/ddd-eeee-fff",
      meetingName: "Google Meet",
      myResponse: "tentative",
      recurring: false,
    });
  });

  it("reads an all-day event", async () => {
    const event = await fetchCalendarEvent(callerAnswering(ALL_DAY_EVENT), options("cocal"), "allday1");
    expect(event).toMatchObject({ allDay: true, dates: { start: "2026-12-25", end: "2026-12-26" } });
  });

  it("reads an event with only an id and a start", async () => {
    const event = await fetchCalendarEvent(callerAnswering(MINIMAL_EVENT), options("google"), "min1");
    expect(event).toMatchObject({
      title: "",
      end: undefined,
      allDay: false,
      timeZone: "Asia/Seoul",
      markdown: "",
      url: undefined,
      meetingName: undefined,
      attendees: [],
      recurring: false,
    });
  });

  it("answers an unreadable reply with one line and the raw text after it, and logs why", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchCalendarEvent(callerAnswering({ event: { summary: "no id" } }), options("cocal"), "x")).rejects.toThrow(
      'The calendar server answered in a format mothership can\'t read.\n{"event":{"summary":"no id"}}',
    );
    expect(log).toHaveBeenCalledOnce();
  });
});
