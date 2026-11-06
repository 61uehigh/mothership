import { z } from "zod";
import type { CalendarEventState, DashboardItem } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { findWidget, type ToolSource, type ToolWidget } from "@/features/tools/server/ToolSource";
import { eventPrompt, makeItem } from "@/features/tools/model/dashboardItem";
import { parseJson, truncate } from "@/features/tools/server/sourceUtils";
import { addDays, zonedDate, zonedMidnight, zonedTime } from "@/lib/dates";

/**
 * ### CalendarFlavor
 *
 * Which Calendar MCP server answers: `cocal` is @cocal/google-calendar-mcp
 * (`list-events`, `timeMin`), `google` is the claude.ai Google Calendar
 * connector (`list_events`, `startTime`). Both return Google's event JSON.
 */
export type CalendarFlavor = "cocal" | "google";

/**
 * ### googleEventSchema
 *
 * Google's event JSON, as both Calendar servers return it (checked against
 * the connector's `get_event` and cocal 2.7's `get-event`). The meeting link
 * is `hangoutLink` (cocal) or `conferenceUrl` (google). Fields mothership
 * does not show, such as `originalStartTime` or `recurrence`, are ignored.
 * Used for the dashboard list and for event details.
 */
export const googleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  /** `default`, `outOfOffice`, `focusTime`, `workingLocation`, …; missing means `default`. */
  eventType: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() }),
  /** Google always sends it; a missing one reads as an event without an end rather than as unreadable. */
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).default({}),
  htmlLink: z.string().optional(),
  hangoutLink: z.string().optional(),
  conferenceUrl: z.string().optional(),
  /** The connector flattens the meeting's name to `solutionName`; cocal passes Google's `conferenceSolution.name`. */
  conferenceData: z
    .object({ solutionName: z.string().optional(), conferenceSolution: z.object({ name: z.string().optional() }).optional() })
    .transform((data) => ({ solutionName: data.solutionName ?? data.conferenceSolution?.name }))
    .optional(),
  organizer: z.object({ displayName: z.string().optional(), email: z.string().optional() }).optional(),
  recurringEventId: z.string().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().optional(),
        displayName: z.string().optional(),
        responseStatus: z.string().optional(),
        self: z.boolean().optional(),
        organizer: z.boolean().optional(),
        optional: z.boolean().optional(),
      }),
    )
    .optional(),
});

/**
 * ### GoogleEvent
 *
 * One event parsed by {@link googleEventSchema}.
 */
export type GoogleEvent = z.infer<typeof googleEventSchema>;

/**
 * ### calendarListSchema
 *
 * A list of events, as both Calendar servers return it. The claude.ai
 * connector leaves `events` out entirely when there are none (a weekend, an
 * empty week), sending only the calendar's own fields, so a missing list
 * means no events, as long as those fields show it is a calendar answer.
 */
export const calendarListSchema = z
  .object({
    events: z.array(googleEventSchema).optional(),
    nextPageToken: z.string().optional(),
    timeZone: z.string().optional(),
    summary: z.string().optional(),
    accessRole: z.string().optional(),
  })
  .refine((list) => list.events !== undefined || list.timeZone !== undefined || list.accessRole !== undefined, "Not a list of calendar events")
  .transform((list) => ({ ...list, events: list.events ?? [] }));

/**
 * ### eventEpoch
 *
 * A timed event's instant, or for an all-day event (a bare `YYYY-MM-DD`)
 * midnight of that day in `timeZone`, so it sorts before that morning's
 * meetings and falls on the right date. The one rule for the sidebar, the
 * Inbox, and the event views.
 *
 * @returns `undefined` when the point has neither or can't be read.
 */
export function eventEpoch(point: GoogleEvent["start"], timeZone: string): number | undefined {
  const ms = point.dateTime !== undefined ? Date.parse(point.dateTime) : point.date !== undefined ? zonedMidnight(point.date, timeZone) : NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Whether the event overlaps today in `timeZone`, so day 2 of a trip or a
 * meeting that started before midnight still counts as today's.
 */
function overlapsToday(start: number | undefined, end: number | undefined, timeZone: string, now: number): boolean {
  const today = zonedDate(now, timeZone);
  if (start === undefined) return true;
  const ends = end !== undefined && end > start ? end : start + 1;
  return start < zonedMidnight(addDays(today, 1), timeZone) && ends > zonedMidnight(today, timeZone);
}

function toItem(event: GoogleEvent, timeZone: string, now: number, state: CalendarEventState) {
  const start = eventEpoch(event.start, timeZone);
  const end = eventEpoch(event.end, timeZone);
  const allDay = event.start.dateTime === undefined;
  const range = allDay || start === undefined || end === undefined ? undefined : `${zonedTime(start, timeZone)}–${zonedTime(end, timeZone)}`;
  const title = event.summary ?? "";
  const day = zonedDate(start ?? now, timeZone);
  return makeItem({
    id: event.id,
    title,
    subtitle: event.location,
    meta: range ?? { allDay: true, day: undefined },
    at: start,
    url: event.htmlLink,
    meetingUrl: event.hangoutLink ?? event.conferenceUrl,
    highlighted: state === "now" || state === "next",
    muted: state === "past" && !allDay && end !== undefined && end <= now,
    event: {
      state,
      day,
      today: overlapsToday(start, end, timeZone, now),
      end,
      allDay,
      // The cocal server says `outOfOffice`, the claude.ai connector `OUT_OF_OFFICE`.
      eventType: (event.eventType ?? "default").replace(/_/g, "").toLowerCase(),
      series: event.recurringEventId,
      myResponse: event.attendees?.find((a) => a.self === true)?.responseStatus,
    },
    delegatePrompt: eventPrompt({ title, when: `${day} ${range ?? "all day"}`, location: event.location, description: event.description }),
  });
}

/**
 * ### parseCalendarEvents
 *
 * Normalises `list-events` output, marking the meeting in progress and the
 * next one. Cancelled events and events you declined are dropped.
 *
 * @param text - Raw tool output.
 * @returns Items ordered by start time.
 * @throws Error When the output is not the expected JSON.
 */
export function parseCalendarEvents(text: string, timeZone: string, now: number): Array<DashboardItem> {
  const parsed = calendarListSchema.safeParse(parseJson(text));
  if (!parsed.success) throw unreadableList(text);
  return calendarItems(parsed.data.events, timeZone, now);
}

function unreadableList(text: string): Error {
  return new Error(`Could not parse the calendar response: ${truncate(text, 200)}`);
}

function calendarItems(listed: Array<GoogleEvent>, timeZone: string, now: number): Array<DashboardItem> {
  const events = listed
    .filter((e) => e.status !== "cancelled")
    .filter((e) => e.attendees?.find((a) => a.self === true)?.responseStatus !== "declined")
    .sort((a, b) => (eventEpoch(a.start, timeZone) ?? 0) - (eventEpoch(b.start, timeZone) ?? 0));

  const timed = (e: GoogleEvent) => e.start.dateTime !== undefined;
  const current = events.find((e) => timed(e) && (eventEpoch(e.start, timeZone) ?? 0) <= now && now < (eventEpoch(e.end, timeZone) ?? 0));
  // "Next" is for today's list; tomorrow's first meeting is not next.
  const today = zonedDate(now, timeZone);
  const next = events.find((e) => timed(e) && (eventEpoch(e.start, timeZone) ?? 0) > now && zonedDate(eventEpoch(e.start, timeZone) ?? now, timeZone) === today);
  return events.map((e) =>
    toItem(e, timeZone, now, e === current ? "now" : e === next ? "next" : (eventEpoch(e.end, timeZone) ?? 0) <= now ? "past" : "later"),
  );
}

/**
 * ### rangeArgs
 *
 * Arguments for listing events between two local times (`YYYY-MM-DDTHH:mm:ss`) on either server.
 */
export function rangeArgs(flavor: CalendarFlavor, calendars: Array<string>, timeZone: string, from: string, to: string) {
  if (flavor === "google") {
    // The connector takes one calendar per call (callers make one per calendar); the primary calendar is the default.
    const calendarId = calendars[0] === "primary" ? undefined : calendars[0];
    return { calendarId, startTime: from, endTime: to, timeZone, orderBy: "startTime", pageSize: 100 };
  }
  return {
    calendarId: calendars.length === 1 ? calendars[0] : calendars,
    timeMin: from,
    timeMax: to,
    timeZone,
  };
}

/** Pages followed per list before stopping, so a runaway calendar cannot hold a load forever. */
const MAX_PAGES = 5;

/**
 * ### listEvents
 *
 * Lists events with `args` (from {@link rangeArgs}). On the claude.ai
 * connector, which answers a page at a time, it follows `nextPageToken` for
 * up to five pages; @cocal's server answers in one call.
 *
 * @param unreadable - The error to throw when a page is not an event list.
 * @returns Every event of every page read, in the order they came.
 */
export async function listEvents(
  caller: ToolCaller,
  flavor: CalendarFlavor,
  args: Record<string, unknown>,
  unreadable: (text: string, error: z.ZodError) => Error,
): Promise<Array<GoogleEvent>> {
  const events: Array<GoogleEvent> = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const text = await caller.callText(flavor === "google" ? "list_events" : "list-events", pageToken === undefined ? args : { ...args, pageToken });
    const parsed = calendarListSchema.safeParse(parseJson(text));
    if (!parsed.success) throw unreadable(text, parsed.error);
    events.push(...parsed.data.events);
    pageToken = parsed.data.nextPageToken;
    if (flavor !== "google" || pageToken === undefined) break;
  }
  return events;
}

/**
 * ### CALENDAR_DAYS_AHEAD
 *
 * The widget loads today and this many days after it in one call: the
 * sidebar shows today, and the Inbox the week ahead from the same cache.
 */
export const CALENDAR_DAYS_AHEAD = 7;

/**
 * ### fetchCalendarAhead
 *
 * @returns Events from today (in `timeZone`) through {@link CALENDAR_DAYS_AHEAD}
 *   days later across `calendars`: one call on @cocal's server, one per
 *   calendar on the claude.ai connector (an event on two calendars shows once).
 */
export async function fetchCalendarAhead(
  caller: ToolCaller,
  options: { calendars: Array<string>; timeZone: string; flavor: CalendarFlavor },
  now: number,
): Promise<Array<DashboardItem>> {
  const today = zonedDate(now, options.timeZone);
  const from = `${today}T00:00:00`;
  const to = `${addDays(today, CALENDAR_DAYS_AHEAD + 1)}T00:00:00`;
  // The connector takes one calendar per call.
  const perCall = options.flavor === "google" ? options.calendars.map((calendar) => [calendar]) : [options.calendars];
  const lists = await Promise.all(
    perCall.map((calendars) => listEvents(caller, options.flavor, rangeArgs(options.flavor, calendars, options.timeZone, from, to), unreadableList)),
  );
  const seen = new Set<string>();
  const events = lists.flat().filter((e) => !seen.has(e.id) && seen.add(e.id));
  return calendarItems(events, options.timeZone, now);
}

/**
 * ### searchCalendar
 *
 * Searches events from 90 days ago to 90 days ahead.
 *
 * @returns Matching events, oldest first.
 */
export async function searchCalendar(
  caller: ToolCaller,
  options: { calendars: Array<string>; timeZone: string; flavor: CalendarFlavor },
  query: string,
  now: number,
): Promise<Array<DashboardItem>> {
  const today = zonedDate(now, options.timeZone);
  const range = rangeArgs(
    options.flavor,
    options.calendars,
    options.timeZone,
    `${addDays(today, -90)}T00:00:00`,
    `${addDays(today, 90)}T00:00:00`,
  );
  const text =
    options.flavor === "google"
      ? await caller.callText("list_events", { ...range, fullText: query, pageSize: 20 })
      : await caller.callText("search-events", { ...range, query });
  return parseCalendarEvents(text, options.timeZone, now).map((item) => {
    const day = item.at === undefined ? undefined : zonedDate(item.at, options.timeZone);
    return {
      ...item,
      // Now, Next, and today describe today only; in search results they would mislead.
      event: undefined,
      highlighted: false,
      muted: false,
      meta: typeof item.meta !== "string" ? { allDay: true as const, day } : day === undefined ? item.meta : `${day.slice(5)} ${item.meta}`,
    };
  });
}

type CalendarWidget = Extract<ToolWidget, { type: "calendar" }>;

/** The server a connector-backed widget reaches is Google's own; a direct MCP server is @cocal's. */
function calendarOptions(widget: CalendarWidget, timeZone: string) {
  return { calendars: widget.calendars, timeZone, flavor: widget.via === "claude-connector" ? ("google" as const) : ("cocal" as const) };
}

/**
 * ### calendarToolSource
 *
 * The week ahead for the widget (the sidebar shows today, the Inbox all of
 * it); events from three months back to three ahead for search.
 */
export const calendarToolSource: ToolSource<CalendarWidget> = {
  load: (caller, widget, { now, timeZone }) => fetchCalendarAhead(caller, calendarOptions(widget, timeZone), now),
  search: (caller, widget, query, { now, timeZone }) => searchCalendar(caller, calendarOptions(widget, timeZone), query, now),
};

/**
 * ### calendarSettings
 *
 * How the calendar widget reads events, so an event detail view asks the
 * same calendar through the same server.
 *
 * @returns `undefined` when there is no calendar widget.
 */
export function calendarSettings(config: DashboardConfig): { flavor: CalendarFlavor; calendarId: string; timeZone: string } | undefined {
  const widget = findWidget(config, "calendar");
  if (widget === undefined) return undefined;
  const options = calendarOptions(widget, config.timezone);
  return { flavor: options.flavor, calendarId: options.calendars[0] ?? "primary", timeZone: options.timeZone };
}
