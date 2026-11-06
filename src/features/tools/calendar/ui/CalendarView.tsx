"use client";

import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToolDocument } from "@/features/tools/ui/toolDoc";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { useStoredState } from "@/ui/useStoredState";
import type { CalendarEventDetail } from "@/features/tools/model/Tools";
import { useNow } from "@/ui/useNow";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { LoadError } from "@/shell/tabFrame";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import { useFormat } from "@/ui/i18n/format";
import { useT } from "@/ui/i18n/useT";
import { itemTitle } from "@/ui/i18n/itemTitle";
import { addDays } from "@/lib/dates";
import { HOUR_PX, layoutDay, weekStart, zonedClock } from "@/features/tools/calendar/ui/dayLayout";

type View = "day" | "week";
type Range = { timeZone: string; events: Array<CalendarEventDetail> };

const VIEW_KEY = "mothership.calendar.view";
const parseView = (raw: string): View | undefined => (raw === "day" || raw === "week" ? raw : undefined);
const SCROLL_TO_HOUR = 8;
const CLOCK_TICK_MS = 60_000;

function dayLabel(date: string, view: View, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: view === "day" ? "long" : undefined, day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function rangeLabel(from: string, days: number, locale: string): string {
  const format = (date: string, withYear: boolean) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: withYear ? "numeric" : undefined, timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00Z`),
    );
  return days === 1 ? format(from, true) : `${format(from, false)} – ${format(addDays(from, days - 1), true)}`;
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
  const t = useT();
  const { dateLocale } = useFormat();
  const workbench = useWorkbenchActions();
  const now = useNow(CLOCK_TICK_MS);
  const [view, setView] = useStoredState<View>(VIEW_KEY, "week", parseView);
  // `undefined` until mounted: the date depends on the clock, which must not run during prerender.
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  // Until you move, the anchor follows today in the dashboard's zone, which is known only once events arrive.
  const followsToday = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnchor(zonedClock(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone).date);
    });
    return () => clearTimeout(timer);
  }, []);

  const days = view === "day" ? 1 : 7;
  const from = anchor === undefined ? undefined : view === "day" ? anchor : weekStart(anchor);
  const state = useToolDocument<Range>(from === undefined ? undefined : `/api/tools/calendar/events?from=${from}&days=${days}`, "calendar");
  const data = from === undefined ? undefined : state.data;
  const timeZone = data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dates = useMemo(() => (from === undefined ? [] : Array.from({ length: days }, (_, i) => addDays(from, i))), [from, days]);
  const today = now > 0 ? zonedClock(now, timeZone) : undefined;
  const dashboardZone = data?.timeZone;

  useEffect(() => {
    if (dashboardZone === undefined || !followsToday.current) return;
    followsToday.current = false;
    const timer = setTimeout(() => setAnchor(zonedClock(Date.now(), dashboardZone).date));
    return () => clearTimeout(timer);
  }, [dashboardZone]);

  useEffect(() => {
    if (scroller.current !== null) scroller.current.scrollTop = SCROLL_TO_HOUR * HOUR_PX - 8;
  }, [view]);

  const step = (direction: number) => {
    followsToday.current = false;
    setAnchor((a) => (a === undefined ? a : addDays(a, direction * days)));
  };
  const open = (event: CalendarEventDetail) => workbench.open({ kind: "event", eventId: event.id, title: event.title }, { preview: true });

  const allDay = (date: string) => (data?.events ?? []).filter((e) => e.dates !== undefined && e.dates.start <= date && date < e.dates.end);
  const hasAllDay = dates.some((date) => allDay(date).length > 0);

  const button = "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <button type="button" className={button} disabled={today === undefined} onClick={() => today !== undefined && setAnchor(today.date)}>
          {t("calendar.today")}
        </button>
        <span className="flex">
          <button type="button" aria-label={t(view === "day" ? "calendar.previousDay" : "calendar.previousWeek")} className={ICON_BUTTON} onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label={t(view === "day" ? "calendar.nextDay" : "calendar.nextWeek")} className={ICON_BUTTON} onClick={() => step(1)}>
            <ChevronRight size={16} />
          </button>
        </span>
        <h1 className="text-sm font-semibold">{from === undefined ? "" : rangeLabel(from, days, dateLocale)}</h1>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" aria-label={t("calendar.reload")} title={t("calendar.reload")} className={button} disabled={state.loading} onClick={state.reload}>
            <RefreshCw size={12} className={state.loading && from !== undefined ? "animate-spin" : undefined} />
          </button>
          <SegmentedControl
            label={t("calendar.view")}
            value={view}
            options={[
              { value: "day", label: t("calendar.view.day") },
              { value: "week", label: t("calendar.view.week") },
            ]}
            onChange={setView}
            className="flex rounded-md bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800"
            optionClassName={(selected) => `rounded px-2.5 py-0.5 ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
          />
        </span>
      </header>
      {state.error !== undefined && from !== undefined && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs dark:border-red-900/60 dark:bg-red-950/40">
          <LoadError message={state.error} />
        </div>
      )}

      <div className="flex shrink-0 border-b border-zinc-200 pl-12 dark:border-zinc-800">
        {dates.map((date) => (
          <div key={date} className="min-w-0 flex-1 border-l border-zinc-200 px-1.5 py-1 text-center text-xs dark:border-zinc-800">
            <span className={`whitespace-nowrap ${date === today?.date ? "rounded-full bg-teal-600 px-1.5 py-0.5 font-semibold text-white" : "text-zinc-600 dark:text-zinc-400"}`}>
              {dayLabel(date, view, dateLocale)}
            </span>
            {hasAllDay && (
              <div className="mt-1 flex flex-col gap-0.5">
                {allDay(date).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => open(event)}
                    className={`truncate rounded border px-1 text-left text-[11px] ${eventClass(event)}`}
                    title={itemTitle(t, event.title)}
                  >
                    {itemTitle(t, event.title)}
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
                {hour > 0 && <span className="absolute -top-1.5 right-1.5 whitespace-nowrap">{String(hour).padStart(2, "0")}:00</span>}
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
                  title={itemTitle(t, event.title)}
                  className={`absolute overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight ${eventClass(event)}`}
                  style={{ top, height, left: `calc(${(column / columns) * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)` }}
                >
                  <span className="block truncate font-medium">{itemTitle(t, event.title)}</span>
                  {height >= 32 && event.start !== undefined && (
                    <span className="block truncate opacity-80">
                      {new Intl.DateTimeFormat(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(event.start)}
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
          <p className="absolute top-2 left-1/2 -translate-x-1/2 rounded bg-zinc-800 px-2 py-1 text-xs text-white">{t("calendar.loading")}</p>
        )}
      </div>
    </div>
  );
}
