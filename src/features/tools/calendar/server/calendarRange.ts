import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import type { DashboardService, ToolOutcome } from "@/features/tools/server/DashboardService";
import type { DetailCache } from "@/features/tools/server/DetailCache";
import { fetchCalendarRange } from "@/features/tools/calendar/server/calendarEvent";
import { calendarSettings } from "@/features/tools/calendar/server/calendarSource";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### CalendarSetup
 *
 * Which calendar the `calendar` widget reads, in which zone.
 */
export type CalendarSetup = NonNullable<ReturnType<typeof calendarSettings>>;

/**
 * ### calendarSetup
 *
 * @returns Which calendar the `calendar` widget reads, in which zone.
 * @throws {@link HttpError} 409 with code `calendar-not-set-up` when there is no calendar widget.
 */
export async function calendarSetup(dashboard: Pick<DashboardService, "config">): Promise<CalendarSetup> {
  const settings = calendarSettings(await dashboard.config());
  if (settings === undefined) throw new HttpError("No calendar widget in config/dashboard.yaml", 409, "calendar-not-set-up");
  return settings;
}

/**
 * ### calendarRange
 *
 * Events for `days` days from `from` (`YYYY-MM-DD` in the calendar's zone),
 * through one ten-minute cache entry per range, which the Calendar's day
 * and week views and the Daily tab share.
 *
 * @param refresh - Skip the cache.
 * @throws {@link HttpError} From {@link calendarSetup}.
 */
export async function calendarRange(
  tools: { dashboard: Pick<DashboardService, "config" | "callTool">; details: DetailCache },
  from: string,
  days: number,
  refresh: boolean,
): Promise<ToolOutcome<{ timeZone: string; events: Array<CalendarEventDetail> }>> {
  const settings = await calendarSetup(tools.dashboard);
  // Under the calendar's detail prefix, so a calendar write (an RSVP) forgets it too.
  return tools.details.cached(`calendar-range:${from}:${days}`, refresh, () =>
    tools.dashboard.callTool("calendar", async (caller) => ({ timeZone: settings.timeZone, events: await fetchCalendarRange(caller, settings, from, days) })),
  );
}
