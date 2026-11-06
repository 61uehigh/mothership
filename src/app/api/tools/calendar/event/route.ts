import { z } from "zod";
import { parseQuery, respondWith } from "@/app/api/_lib/http";
import { fetchCalendarEvent } from "@/features/tools/calendar/server/calendarEvent";
import { getDetailCache } from "@/composition/server";
import { calendarSettings } from "@/features/tools/calendar/server/calendarSource";
import { getDashboard } from "@/composition/server";

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
  const dashboard = getDashboard();
  const settings = calendarSettings(await dashboard.config());
  if (settings === undefined) return Response.json({ error: "Can't load the event: no calendar widget in config/dashboard.yaml" }, { status: 409 });
  const outcome = await getDetailCache().cached(`calendar:${id}`, refresh === "1", () =>
    dashboard.callTool("calendar", (caller) => fetchCalendarEvent(caller, settings, id)),
  );
  return respondWith(outcome, "Calendar event");
}
