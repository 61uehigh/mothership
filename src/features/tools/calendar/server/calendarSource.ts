import { z } from "zod";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { findWidget, type ToolSource, type ToolWidget } from "@/features/tools/server/ToolSource";
import { addDays, makeItem, parseJson, truncate, zonedDate, zonedMidnight, zonedTime } from "@/features/tools/server/sourceUtils";

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
 * the connector's `get_event`). The meeting link is `hangoutLink` (cocal) or
 * `conferenceUrl` (google). Used for the dashboard list and for event details.
 */
export const googleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional(), timeZone: z.string().optional() }),
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }),
  htmlLink: z.string().optional(),
  hangoutLink: z.string().optional(),
  conferenceUrl: z.string().optional(),
  conferenceData: z.object({ solutionName: z.string().optional() }).optional(),
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
 * A timed event's instant, or for an all-day event (a bare `YYYY-MM-DD`)
 * midnight of that day in `timeZone`, so it sorts before that morning's
 * meetings and labels with the right date.
 */
function epoch(point: GoogleEvent["start"], timeZone: string): number | undefined {
  const ms = point.dateTime !== undefined ? Date.parse(point.dateTime) : point.date !== undefined ? zonedMidnight(point.date, timeZone) : NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

function toItem(event: GoogleEvent, timeZone: string, now: number, state: "past" | "now" | "next" | "later") {
  const start = epoch(event.start, timeZone);
  const end = epoch(event.end, timeZone);
  const allDay = event.start.dateTime === undefined;
  const range =
    allDay || start === undefined || end === undefined
      ? "All day"
      : `${zonedTime(start, timeZone)}–${zonedTime(end, timeZone)}`;
  const title = event.summary ?? "(untitled)";
  const meetingLink = event.hangoutLink ?? event.conferenceUrl;
  return makeItem({
    id: event.id,
    title,
    subtitle: event.location,
    meta: range,
    at: start,
    url: event.htmlLink,
    secondaryLink: meetingLink === undefined ? undefined : { label: "Join meeting", url: meetingLink },
    badge:
      state === "now"
        ? { label: "Now", tone: "success" }
        : state === "next"
          ? { label: "Next", tone: "info" }
          : undefined,
    highlighted: state === "now" || state === "next",
    muted: state === "past" && !allDay && end !== undefined && end <= now,
    delegatePrompt: [
      `Help me prepare for this event: "${title}" (${zonedDate(start ?? now, timeZone)} ${range})`,
      event.location === undefined ? "" : `Location: ${event.location}`,
      event.description === undefined ? "" : `Description:\n${truncate(event.description, 1500)}`,
      "",
      "Find related Linear issues, Nuclino docs, and Slack conversations, and summarize what I should know before the meeting.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
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
  if (!parsed.success) throw new Error(`Could not parse the calendar response: ${truncate(text, 200)}`);
  const events = parsed.data.events
    .filter((e) => e.status !== "cancelled")
    .filter((e) => e.attendees?.find((a) => a.self === true)?.responseStatus !== "declined")
    .sort((a, b) => (epoch(a.start, timeZone) ?? 0) - (epoch(b.start, timeZone) ?? 0));

  const timed = (e: GoogleEvent) => e.start.dateTime !== undefined;
  const current = events.find((e) => timed(e) && (epoch(e.start, timeZone) ?? 0) <= now && now < (epoch(e.end, timeZone) ?? 0));
  const next = events.find((e) => timed(e) && (epoch(e.start, timeZone) ?? 0) > now);
  return events.map((e) =>
    toItem(e, timeZone, now, e === current ? "now" : e === next ? "next" : (epoch(e.end, timeZone) ?? 0) <= now ? "past" : "later"),
  );
}

/**
 * ### rangeArgs
 *
 * Arguments for listing events between two local times (`YYYY-MM-DDTHH:mm:ss`) on either server.
 */
export function rangeArgs(flavor: CalendarFlavor, calendars: Array<string>, timeZone: string, from: string, to: string) {
  if (flavor === "google") {
    // The connector takes one calendar per call; the primary calendar is the default.
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

/**
 * ### fetchCalendarToday
 *
 * @returns Today's events (in `timeZone`) across `calendars`.
 */
export async function fetchCalendarToday(
  caller: ToolCaller,
  options: { calendars: Array<string>; timeZone: string; flavor: CalendarFlavor },
  now: number,
): Promise<Array<DashboardItem>> {
  const today = zonedDate(now, options.timeZone);
  const text = await caller.callText(
    options.flavor === "google" ? "list_events" : "list-events",
    rangeArgs(options.flavor, options.calendars, options.timeZone, `${today}T00:00:00`, `${addDays(today, 1)}T00:00:00`),
  );
  return parseCalendarEvents(text, options.timeZone, now);
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
  return parseCalendarEvents(text, options.timeZone, now).map((item) => ({
    ...item,
    // Badges describe today only; in search results they would mislead.
    badge: undefined,
    highlighted: false,
    muted: false,
    meta: item.at === undefined ? item.meta : `${zonedDate(item.at, options.timeZone).slice(5)} ${item.meta}`,
  }));
}

type CalendarWidget = Extract<ToolWidget, { type: "calendar" }>;

/** The server a connector-backed widget reaches is Google's own; a direct MCP server is @cocal's. */
function calendarOptions(widget: CalendarWidget, timeZone: string) {
  return { calendars: widget.calendars, timeZone, flavor: widget.via === "claude-connector" ? ("google" as const) : ("cocal" as const) };
}

/**
 * ### calendarToolSource
 *
 * Today's events for the widget; events from three months back to three ahead for search.
 */
export const calendarToolSource: ToolSource<CalendarWidget> = {
  load: (caller, widget, { now, timeZone }) => fetchCalendarToday(caller, calendarOptions(widget, timeZone), now),
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
