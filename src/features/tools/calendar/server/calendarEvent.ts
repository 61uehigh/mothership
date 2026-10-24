import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import { calendarListSchema, googleEventSchema, rangeArgs, type CalendarFlavor, type GoogleEvent } from "@/features/tools/calendar/server/calendarSource";
import { notFoundOn, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { addDays, isoToEpoch, parseJson, truncate } from "@/features/tools/server/sourceUtils";

// Google Calendar answers a missing or deleted event with "Not Found" (HTTP 404).
const NOT_FOUND = /\bnot found\b|\b404\b/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/**
 * ### htmlToMarkdown
 *
 * Google event descriptions are light HTML (`<br>`, `<a>`, `<b>`, lists).
 * Converts the common tags and drops the rest; plain-text descriptions pass
 * through with their line breaks.
 */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_, href: string, label: string) => (label === href ? `<${href}>` : `[${label}](${href})`))
    .replace(/<\/?(b|strong)>/gi, "**")
    .replace(/<\/?(i|em)>/gi, "*")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name])
    .replace(/([^\n])\n(?=[^\n])/g, "$1  \n")
    .trim();
}

/**
 * A timed event's instant; for an all-day event (a bare `YYYY-MM-DD`) UTC
 * midnight of that day, which the event views read as the date itself.
 */
function epoch(point: GoogleEvent["start"]): number | undefined {
  return isoToEpoch(point.dateTime ?? point.date);
}

/**
 * ### fetchCalendarEvent
 *
 * @param calendarId - The calendar the widget lists; `primary` for your own.
 * @throws Error When the call fails or its output is not an event.
 */
export async function fetchCalendarEvent(
  caller: ToolCaller,
  options: { flavor: CalendarFlavor; calendarId: string; timeZone: string },
  eventId: string,
): Promise<CalendarEventDetail> {
  const text =
    options.flavor === "google"
      ? // The connector defaults to the primary calendar.
        await notFoundOn(
            caller.callText("get_event", { eventId, ...(options.calendarId === "primary" ? {} : { calendarId: options.calendarId }) }),
            NOT_FOUND,
          )
      : await notFoundOn(caller.callText("get-event", { calendarId: options.calendarId, eventId }), NOT_FOUND);
  const parsed = googleEventSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the calendar event: ${truncate(text, 200)}`);
  return toDetail(parsed.data, options.timeZone);
}

function toDetail(e: GoogleEvent, timeZone: string): CalendarEventDetail {
  const attendees = (e.attendees ?? []).map((a) => ({
    name: a.displayName ?? a.email ?? "Unknown",
    email: a.email,
    response: a.responseStatus ?? "needsAction",
    self: a.self === true,
    organizer: a.organizer === true,
    optional: a.optional === true,
  }));
  return {
    id: e.id,
    title: e.summary ?? "(untitled)",
    start: epoch(e.start),
    end: epoch(e.end),
    allDay: e.start.dateTime === undefined,
    timeZone: e.start.timeZone ?? timeZone,
    location: e.location,
    markdown: e.description === undefined ? "" : htmlToMarkdown(e.description),
    url: e.htmlLink,
    meetingUrl: e.hangoutLink ?? e.conferenceUrl,
    meetingName: e.conferenceData?.solutionName,
    organizer: e.organizer?.displayName ?? e.organizer?.email,
    attendees,
    myResponse: attendees.find((a) => a.self)?.response,
    recurring: e.recurringEventId !== undefined,
    status: e.status,
  };
}

/**
 * ### fetchCalendarRange
 *
 * Events from `from` (a local date, `YYYY-MM-DD`) for `days` days, used by the
 * day and week views. Cancelled events are dropped; declined ones are kept
 * and marked by `myResponse`.
 *
 * @throws Error When the call fails or its output is not an event list.
 */
export async function fetchCalendarRange(
  caller: ToolCaller,
  options: { flavor: CalendarFlavor; calendarId: string; timeZone: string },
  from: string,
  days: number,
): Promise<Array<CalendarEventDetail>> {
  const args = rangeArgs(options.flavor, [options.calendarId], options.timeZone, `${from}T00:00:00`, `${addDays(from, days)}T00:00:00`);
  const text = await caller.callText(options.flavor === "google" ? "list_events" : "list-events", {
    ...args,
    ...(options.flavor === "google" ? { pageSize: 250 } : {}),
  });
  const parsed = calendarListSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the calendar events: ${truncate(text, 200)}`);
  return parsed.data.events
    .filter((e) => e.status !== "cancelled")
    .map((e) => toDetail(e, options.timeZone))
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/**
 * ### respondToEvent
 *
 * Sets your reply to an invitation. Only the claude.ai Google Calendar
 * connector has a reply tool.
 *
 * @throws Error When the source cannot reply or the call fails.
 */
export async function respondToEvent(
  caller: ToolCaller,
  options: { flavor: CalendarFlavor; calendarId: string },
  eventId: string,
  response: "accepted" | "tentative" | "declined",
): Promise<void> {
  if (options.flavor !== "google") throw new Error("Replying to invitations needs the calendar widget to use the claude.ai Google Calendar connector");
  await caller.callText("respond_to_event", {
    eventId,
    responseStatus: response,
    ...(options.calendarId === "primary" ? {} : { calendarId: options.calendarId }),
  });
}
