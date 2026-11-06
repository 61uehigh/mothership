import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import { addDays, zonedDate, zonedMinutes } from "@/lib/dates";

/**
 * ### HOUR_PX
 *
 * Height of one hour in the calendar's grid, in pixels.
 */
export const HOUR_PX = 48;

const DAY_MINUTES = 24 * 60;
const MIN_EVENT_MINUTES = 15;
const MIN_EVENT_PX = 18;

/**
 * ### weekStart
 *
 * @param date - `YYYY-MM-DD`.
 * @returns The Monday of the week containing `date`, `YYYY-MM-DD`.
 */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * ### zonedClock
 *
 * @returns The date (`YYYY-MM-DD`) and minutes since midnight of `epochMs` in `timeZone`.
 */
export function zonedClock(epochMs: number, timeZone: string): { date: string; minutes: number } {
  return { date: zonedDate(epochMs, timeZone), minutes: zonedMinutes(epochMs, timeZone) };
}

/**
 * ### PlacedEvent
 *
 * A timed event's box in one day's column: `top` and `height` in pixels,
 * `column` of `columns` side by side within its overlapping cluster.
 */
export type PlacedEvent = { event: CalendarEventDetail; top: number; height: number; column: number; columns: number };

type Span = { event: CalendarEventDetail; from: number; to: number };

/** The leftmost column whose last event has ended by `from`. */
function firstFreeColumn(cluster: Array<{ placed: PlacedEvent; to: number }>, from: number): number {
  let column = 0;
  while (cluster.some((c) => c.placed.column === column && c.to > from)) column++;
  return column;
}

/** The minutes of `date` that `event` covers, clipped to the day; `undefined` when it does not show on `date`. */
function spanOn(event: CalendarEventDetail, date: string, timeZone: string): Span | undefined {
  const start = zonedClock(event.start ?? 0, timeZone);
  const end = zonedClock(event.end ?? event.start ?? 0, timeZone);
  // An event ending at exactly 00:00 belongs to the day before, not to this one.
  if (start.date > date || end.date < date || (end.date === date && end.minutes === 0 && start.date < date)) return undefined;
  const from = start.date < date ? 0 : start.minutes;
  const to = end.date > date ? DAY_MINUTES : Math.max(end.minutes, from + MIN_EVENT_MINUTES);
  return { event, from, to };
}

/**
 * ### layoutDay
 *
 * Positions the timed events of one day so overlapping ones sit side by
 * side. Events that overlap, directly or through others, form a cluster that
 * shares one column count; a new cluster starts once every earlier event has
 * ended. All-day events are left out.
 *
 * @param date - The day shown, `YYYY-MM-DD` in `timeZone`.
 */
export function layoutDay(events: Array<CalendarEventDetail>, date: string, timeZone: string): Array<PlacedEvent> {
  const spans = events
    .filter((e) => !e.allDay && e.start !== undefined)
    .map((e) => spanOn(e, date, timeZone))
    .filter((s): s is Span => s !== undefined)
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed: Array<PlacedEvent> = [];
  let cluster: Array<{ placed: PlacedEvent; to: number }> = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const columns = Math.max(1, ...cluster.map((c) => c.placed.column + 1));
    for (const c of cluster) c.placed.columns = columns;
    cluster = [];
  };
  for (const span of spans) {
    if (span.from >= clusterEnd) {
      closeCluster();
      clusterEnd = -1;
    }
    const item: PlacedEvent = {
      event: span.event,
      top: (span.from / 60) * HOUR_PX,
      height: Math.max(((span.to - span.from) / 60) * HOUR_PX, MIN_EVENT_PX),
      column: firstFreeColumn(cluster, span.from),
      columns: 1,
    };
    cluster.push({ placed: item, to: span.to });
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, span.to);
  }
  closeCluster();
  return placed;
}
