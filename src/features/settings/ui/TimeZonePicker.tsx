"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { describeZone, listTimeZones, matchesZone, type TimeZoneOption } from "@/features/settings/ui/timeZones";
import { useT } from "@/ui/i18n/useT";
import { ROW_HOVER, SELECTED_ROW } from "@/ui/selection";

/** The open list's height in pixels: the search box (32) and `max-h-72` (288), plus borders and the gap. */
const LIST_HEIGHT = 32 + 288 + 8 + 40;

/** One choice in the list: `value` is what gets saved, `""` for automatic. */
interface Row {
  key: string;
  value: string;
  zone: TimeZoneOption;
  /** The bold-free main text: the city, or "Automatic". */
  title: string;
  /** The muted text after it: the region, the automatic zone's city, or "This computer". */
  note: string;
}

/** Every zone this runtime knows, or none on an old one (the saved and automatic zones are still offered). */
function supportedZones(): ReadonlyArray<string> {
  return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
}

/** The zone of the computer running this page, when the runtime can tell. */
function computerZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * ### TimeZonePicker
 *
 * A searchable list of every IANA zone, each with its city, region, and
 * current UTC offset, sorted west to east. Automatic, this computer's zone,
 * and the saved one sit on top. Choosing one calls `onChange` with its IANA
 * id, or `""` for automatic.
 */
export function TimeZonePicker({ id, value, automatic, disabled, onChange }: { id: string; value: string; automatic: string; disabled?: boolean; onChange: (zone: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const rowId = (index: number) => `${listId}-${index}`;

  // The offsets are read when the list opens, so they follow daylight saving time.
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const all = useMemo(() => (open ? listTimeZones(supportedZones(), [value, automatic], openedAt) : []), [open, value, automatic, openedAt]);

  const automaticZone = describeZone(automatic, openedAt);
  const rows = useMemo<Array<Row>>(() => {
    const toRow = (zone: TimeZoneOption, key: string): Row => ({ key, value: zone.id, zone, title: zone.city, note: zone.region });
    if (query.trim() !== "") return all.filter((zone) => matchesZone(zone, query)).map((zone) => toRow(zone, zone.id));
    const suggested: Array<Row> = [{ key: "automatic", value: "", zone: automaticZone, title: t("general.timezoneAutomatic"), note: automaticZone.city }];
    const computer = computerZone();
    if (computer !== undefined && computer !== automatic) {
      suggested.push({ key: "computer", value: computer, zone: describeZone(computer, openedAt), title: describeZone(computer, openedAt).city, note: t("general.timezoneThisComputer") });
    }
    if (value !== "" && value !== computer) suggested.push(toRow(describeZone(value, openedAt), "saved"));
    return [...suggested, ...all.map((zone) => toRow(zone, zone.id))];
  }, [all, query, value, automatic, automaticZone, openedAt, t]);
  const suggestedCount = query.trim() === "" ? rows.length - all.length : 0;

  function show() {
    // Open upward when the window has no room for the list below the field.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect !== undefined) setUpward(window.innerHeight - rect.bottom < LIST_HEIGHT && rect.top > window.innerHeight - rect.bottom);
    setOpenedAt(new Date());
    setQuery("");
    setActiveIndex(undefined);
    setOpen(true);
  }
  function hide(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }
  function choose(row: Row | undefined) {
    if (row === undefined) return;
    hide(true);
    if (row.value !== value) onChange(row.value);
  }

  // Until a key or the mouse moves it, the active row is the current choice in the full list.
  const resting = rows.findIndex((row, i) => i >= suggestedCount && row.value === value);
  const active = activeIndex ?? (resting === -1 ? 0 : resting);
  const setActive = (index: number) => setActiveIndex(index);

  // Keep the active row in view within the list, without scrolling the page.
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (list == null || row == null) return;
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [active, open, rows]);

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    const page = 8;
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.max(0, Math.min(rows.length - 1, to)));
    };
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "PageDown") move(active + page);
    else if (event.key === "PageUp") move(active - page);
    else if (event.key === "Enter") {
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide(true);
    } else if (event.key === "Tab") hide(false);
  }

  const current = value === "" ? automaticZone : describeZone(value, openedAt);
  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            show();
          }
        }}
        className="flex h-7 w-full items-center gap-2 rounded-md border border-zinc-300 bg-transparent px-2.5 text-left text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {value === "" && <span className="shrink-0 rounded bg-zinc-200 px-1.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{t("general.timezoneAutomatic")}</span>}
        <span className="min-w-0 truncate">{current.city}</span>
        {current.region !== "" && <span className="min-w-0 truncate text-zinc-500">{current.region}</span>}
        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">{current.offset}</span>
        <ChevronDown size={13} className="shrink-0 text-zinc-500" aria-hidden />
      </button>
      {open && (
        <div className={`absolute inset-x-0 z-30 flex flex-col ${upward ? "bottom-full mb-1" : "top-full mt-1"} overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900`}>
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-200 px-2.5 dark:border-zinc-800">
            <Search size={13} className="shrink-0 text-zinc-500" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={rows[active] === undefined ? undefined : rowId(active)}
              aria-label={t("general.timezone")}
              className="w-full bg-transparent text-xs outline-none placeholder:text-zinc-500"
              placeholder={t("general.timezoneSearch")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label={t("general.timezone")} className="relative max-h-72 overflow-y-auto p-1">
            {rows.length === 0 && <p className="px-2.5 py-1.5 text-xs text-zinc-500">{t("general.timezoneNoMatch", { query: query.trim() })}</p>}
            {rows.map((row, index) => (
              <div key={row.key} className="contents">
                {suggestedCount > 0 && (index === 0 || index === suggestedCount) && (
                  <p
                    role="presentation"
                    className={`flex h-6 items-end px-2.5 pb-0.5 text-[11px] text-zinc-500 uppercase tracking-wide [&:lang(ko)]:tracking-normal ${index === 0 ? "" : "mt-1 border-t border-zinc-200 dark:border-zinc-800"}`}
                  >
                    {index === 0 ? t("general.timezoneSuggested") : t("general.timezoneAll")}
                  </p>
                )}
                <div
                  id={rowId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={row.value === value}
                  onMouseMove={() => active !== index && setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(row)}
                  className={`flex h-7 cursor-default items-center gap-2 rounded px-2 text-xs ${index === active ? SELECTED_ROW : ROW_HOVER}`}
                >
                  <span className="flex w-3.5 shrink-0 justify-center">{row.value === value && <Check size={12} className="text-teal-600 dark:text-teal-400" aria-hidden />}</span>
                  <span className="min-w-0 shrink truncate">{row.title}</span>
                  {row.note !== "" && <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{row.note}</span>}
                  <span className="ml-auto w-[4.75rem] shrink-0 text-right font-mono text-[11px] text-zinc-500">{row.zone.offset}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
