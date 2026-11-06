import { z } from "zod";
import { parseQuery, respondWith } from "@/app/api/_lib/http";
import { fetchCalendarRange } from "@/features/tools/calendar/server/calendarEvent";
import { getDetailCache } from "@/composition/server";
import { calendarSettings } from "@/features/tools/calendar/server/calendarSource";
import { getDashboard } from "@/composition/server";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "from must be YYYY-MM-DD" }),
  days: z.coerce.number().int().min(1).max(7),
  refresh: z.enum(["0", "1"]).default("0"),
});

/**
 * ### GET
 *
 * Events for the day and week views. `?from=YYYY-MM-DD&days=1..7` in the
 * dashboard's time zone; `?refresh=1` skips the ten-minute cache.
 *
 * @returns `{ timeZone, events }` with `CalendarEventDetail` events; 400 for
 *   invalid params, 409 when the calendar is not set up, 502 when it fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const { from, days, refresh } = query;
  const dashboard = getDashboard();
  const settings = calendarSettings(await dashboard.config());
  if (settings === undefined) return Response.json({ error: "No calendar widget in config/dashboard.yaml" }, { status: 409 });
  const outcome = await getDetailCache().cached(`calendar-range:${from}:${days}`, refresh === "1", () =>
    dashboard.callTool("calendar", async (caller) => ({
      timeZone: settings.timeZone,
      events: await fetchCalendarRange(caller, settings, from, days),
    })),
  );
  return respondWith(outcome, "calendar events");
}
