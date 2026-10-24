"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToolDocument } from "@/features/tools/ui/toolDoc";
import { ICON_BUTTON } from "@/ui/IconButton";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { useStoredState } from "@/ui/useStoredState";
import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/WorkbenchContext";

type View = "day" | "week";
type Range = { timeZone: string; events: Array<CalendarEventDetail> };

const VIEW_KEY = "mothership.calendar.view";
const parseView = (raw: string): View | undefined => (raw === "day" || raw === "week" ? raw : undefined);
const VIEWS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
] as const;
const HOUR_PX = 48;
const DAY_MINUTES = 24 * 60;
const SCROLL_TO_HOUR = 8;
const CLOCK_TICK_MS = 60_000;

/** `YYYY-MM-DD` plus `days`, with no time zone involved. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The local date and minutes since midnight of an instant in `timeZone`. */
function zoned(epochMs: number, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(epochMs);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function dayLabel(date: string, view: View): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: view === "day" ? "long" : undefined, day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function rangeLabel(from: string, days: number): string {
  const format = (date: string, withYear: boolean) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  return days === 1 ? format(from, true) : `${format(from, false)} – ${format(addDays(from, days - 1), true)}`;
}

type Placed = { event: CalendarEventDetail; top: number; height: number; column: number; columns: number };

/** Timed events of one day, positioned so overlapping ones sit side by side. */
function layoutDay(events: Array<CalendarEventDetail>, date: string, timeZone: string): Array<Placed> {
  const spans = events
    .filter((e) => !e.allDay && e.start !== undefined)
    .map((e) => {
      const start = zoned(e.start ?? 0, timeZone);
      const end = zoned(e.end ?? e.start ?? 0, timeZone);
      if (start.date > date || end.date < date || (end.date === date && end.minutes === 0 && start.date < date)) return undefined;
      const from = start.date < date ? 0 : start.minutes;
      const to = end.date > date ? DAY_MINUTES : Math.max(end.minutes, from + 15);
      return { event: e, from, to };
    })
    .filter((s): s is { event: CalendarEventDetail; from: number; to: number } => s !== undefined)
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed: Array<Placed> = [];
  let cluster: Array<{ placed: Placed; to: number }> = [];
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
    // First column whose last event has ended.
    let column = 0;
    while (cluster.some((c) => c.placed.column === column && c.to > span.from)) column++;
    const item: Placed = {
      event: span.event,
      top: (span.from / 60) * HOUR_PX,
      height: Math.max(((span.to - span.from) / 60) * HOUR_PX, 18),
      column,
      columns: 1,
    };
    cluster.push({ placed: item, to: span.to });
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, span.to);
  }
  closeCluster();
  return placed;
}

function eventClass(event: CalendarEventDetail): string {
  if (event.myResponse === "declined") return "border-zinc-300 bg-zinc-100 text-zinc-500 line-through dark:border-zinc-700 dark:bg-zinc-900";
  if (event.myResponse === "needsAction") return "border-teal-500 border-dashed bg-white text-teal-800 dark:bg-zinc-950 dark:text-teal-200";
  if (event.myResponse === "tentative") return "border-teal-400 border-dashed bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100";
  return "border-teal-600 bg-teal-100 text-teal-950 dark:border-teal-500 dark:bg-teal-900/60 dark:text-teal-50";
}

/**
 * ### CalendarView
 *
 * Center tab with a day or week calendar (weeks start on Monday): an
 * all-day row, an hourly grid with overlapping events side by side, and a
 * line at the current time. Declined events are struck through; invitations
 * you have not answered are dashed. A click opens the event's tab.
 */
export function CalendarView() {
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const [view, setView] = useStoredState<View>(VIEW_KEY, "week", parseView);
  // `undefined` until mounted: the date depends on the clock, which must not run during prerender.
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnchor(zoned(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone).date);
    });
    return () => clearTimeout(timer);
  }, []);

  const days = view === "day" ? 1 : 7;
  const from = anchor === undefined ? undefined : view === "day" ? anchor : weekStart(anchor);
  const state = useToolDocument<Range>(from === undefined ? undefined : `/api/tools/calendar/events?from=${from}&days=${days}`);
  const data = from === undefined ? undefined : state.data;
  const timeZone = data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dates = useMemo(() => (from === undefined ? [] : Array.from({ length: days }, (_, i) => addDays(from, i))), [from, days]);
  const today = now > 0 ? zoned(now, timeZone) : undefined;

  useEffect(() => {
    if (scroller.current !== null) scroller.current.scrollTop = SCROLL_TO_HOUR * HOUR_PX - 8;
  }, [view]);

  const step = (direction: number) => setAnchor((a) => (a === undefined ? a : addDays(a, direction * days)));
  const open = (event: CalendarEventDetail) => workbench.open({ kind: "event", eventId: event.id, title: event.title }, { preview: true });

  const allDay = (date: string) =>
    (data?.events ?? []).filter((e) => {
      if (!e.allDay || e.start === undefined) return false;
      // All-day dates are UTC midnights; the end date is exclusive.
      const start = new Date(e.start).toISOString().slice(0, 10);
      const end = e.end === undefined ? addDays(start, 1) : new Date(e.end).toISOString().slice(0, 10);
      return start <= date && date < end;
    });
  const hasAllDay = dates.some((date) => allDay(date).length > 0);

  const button = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <button type="button" className={button} disabled={today === undefined} onClick={() => today !== undefined && setAnchor(today.date)}>
          Today
        </button>
        <span className="flex">
          <button type="button" aria-label={`Previous ${view}`} className={ICON_BUTTON} onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label={`Next ${view}`} className={ICON_BUTTON} onClick={() => step(1)}>
            <ChevronRight size={16} />
          </button>
        </span>
        <h1 className="text-sm font-semibold">{from === undefined ? "" : rangeLabel(from, days)}</h1>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" aria-label="Reload" title="Reload" className={button} disabled={state.loading} onClick={state.reload}>
            <RefreshCw size={12} className={state.loading && from !== undefined ? "animate-spin" : undefined} />
          </button>
          <SegmentedControl
            label="View"
            value={view}
            options={VIEWS}
            onChange={setView}
            className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800"
            optionClassName={(selected) => `rounded px-2.5 py-0.5 ${selected ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-500"}`}
          />
        </span>
      </header>
      {state.error !== undefined && from !== undefined && (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex shrink-0 border-b border-zinc-200 pl-12 dark:border-zinc-800">
        {dates.map((date) => (
          <div key={date} className="min-w-0 flex-1 border-l border-zinc-200 px-1.5 py-1 text-center text-xs dark:border-zinc-800">
            <span className={date === today?.date ? "rounded-full bg-teal-600 px-1.5 py-0.5 font-semibold text-white" : "text-zinc-600 dark:text-zinc-400"}>
              {dayLabel(date, view)}
            </span>
            {hasAllDay && (
              <div className="mt-1 flex flex-col gap-0.5">
                {allDay(date).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => open(event)}
                    className={`truncate rounded border px-1 text-left text-[11px] ${eventClass(event)}`}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
          <div className="w-12 shrink-0">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="relative text-right text-[10px] text-zinc-500" style={{ height: HOUR_PX }}>
                {hour > 0 && <span className="absolute -top-1.5 right-1.5">{String(hour).padStart(2, "0")}:00</span>}
              </div>
            ))}
          </div>
          {dates.map((date) => (
            <div key={date} className="relative min-w-0 flex-1 border-l border-zinc-200 dark:border-zinc-800">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="border-t border-zinc-100 dark:border-zinc-900" style={{ height: HOUR_PX }} />
              ))}
              {layoutDay(data?.events ?? [], date, timeZone).map(({ event, top, height, column, columns }) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => open(event)}
                  title={event.title}
                  className={`absolute overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight ${eventClass(event)}`}
                  style={{ top, height, left: `calc(${(column / columns) * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)` }}
                >
                  <span className="block truncate font-medium">{event.title}</span>
                  {height >= 32 && event.start !== undefined && (
                    <span className="block truncate opacity-80">
                      {new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(event.start)}
                      {event.location === undefined ? "" : ` · ${event.location}`}
                    </span>
                  )}
                </button>
              ))}
              {date === today?.date && (
                <div className="pointer-events-none absolute right-0 left-0 z-10 border-t-2 border-red-500" style={{ top: (today.minutes / 60) * HOUR_PX }}>
                  <span className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          ))}
        </div>
        {state.loading && data === undefined && from !== undefined && (
          <p className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-zinc-800 px-2 py-1 text-xs text-white">Loading events…</p>
        )}
      </div>
    </div>
  );
}
