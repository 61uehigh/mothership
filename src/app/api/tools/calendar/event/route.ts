import { z } from "zod";
import { errorResponse, parseQuery, respondWith } from "@/app/api/_lib/http";
import { fetchCalendarEvent } from "@/features/tools/calendar/server/calendarEvent";
import { calendarSetup } from "@/features/tools/calendar/server/calendarRange";
import { getDashboard, getDetailCache } from "@/composition/server";

const querySchema = z.object({
  id: z.string({ error: "id is required" }).trim().min(1, { error: "id is required" }).max(300),
  refresh: z.enum(["0", "1"]).default("0"),
});

/**
 * ### GET
 *
 * Reads one Google Calendar event through the source of the `calendar`
 * dashboard widget. `?id=` is the event id; `?refresh=1` skips the
 * ten-minute cache.
 *
 * @returns A `CalendarEventDetail`; 400 for a missing id, 404 when the event
 *   is gone, 409 when the calendar is not set up, 502 when a call fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const { id, refresh } = query;
  try {
    const settings = await calendarSetup(getDashboard());
    const outcome = await getDetailCache().cached(`calendar:${id}`, refresh === "1", () =>
      getDashboard().callTool("calendar", (caller) => fetchCalendarEvent(caller, settings, id)),
    );
    return respondWith(outcome, "Calendar event");
  } catch (error) {
    return errorResponse(error);
  }
}
