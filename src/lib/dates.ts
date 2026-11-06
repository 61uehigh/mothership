// Calendar days are `YYYY-MM-DD` strings. Day arithmetic works at noon UTC, so no
// time zone or daylight-saving shift can move a date to the day before or after.

const DAY_MS = 24 * 60 * 60_000;

/**
 * ### zonedDate
 *
 * @returns The calendar date of `epochMs` in `timeZone`, as `YYYY-MM-DD`.
 */
export function zonedDate(epochMs: number, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(epochMs);
}

/**
 * ### zonedTime
 *
 * @returns `HH:mm` of `epochMs` in `timeZone`, 24-hour.
 */
export function zonedTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(epochMs);
}

/**
 * ### zonedMinutes
 *
 * @returns Minutes since local midnight of `epochMs` in `timeZone`, 0–1439.
 */
export function zonedMinutes(epochMs: number, timeZone: string): number {
  const [hours, minutes] = zonedTime(epochMs, timeZone).split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * ### zonedMidnight
 *
 * @param date - `YYYY-MM-DD`.
 * @returns Epoch milliseconds of 00:00 on `date` in `timeZone`.
 */
export function zonedMidnight(date: string, timeZone: string): number {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  // The offset at UTC midnight can differ from the one at local midnight on a
  // daylight-saving change day, so it is read again at the first guess.
  const guess = utcMidnight - offsetAt(utcMidnight, timeZone);
  return utcMidnight - offsetAt(guess, timeZone);
}

/** How far `timeZone`'s wall clock is ahead of UTC at `epochMs`, in milliseconds. */
function offsetAt(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(epochMs);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return wall - Math.floor(epochMs / 60_000) * 60_000;
}

/**
 * ### noonUtc
 *
 * @returns Epoch milliseconds of noon UTC on `day`, the instant day arithmetic and weekdays are read at.
 */
export function noonUtc(day: string): number {
  return Date.parse(`${day}T12:00:00Z`);
}

/**
 * ### addDays
 *
 * @param day - `YYYY-MM-DD`.
 * @returns `day` moved by `days` (negative goes back), as `YYYY-MM-DD`.
 */
export function addDays(day: string, days: number): string {
  return new Date(noonUtc(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * ### localDay
 *
 * @returns The date of `epochMs` in the machine's (or browser's) zone, `YYYY-MM-DD`.
 */
export function localDay(epochMs: number): string {
  // sv-SE formats dates as YYYY-MM-DD.
  return new Date(epochMs).toLocaleDateString("sv-SE");
}

/**
 * ### dayBounds
 *
 * @returns Epoch milliseconds of local midnight starting `day` and the next
 *   one; a day with a daylight-saving change is 23 or 25 hours long.
 */
export function dayBounds(day: string): { from: number; to: number } {
  return { from: new Date(`${day}T00:00:00`).getTime(), to: new Date(`${addDays(day, 1)}T00:00:00`).getTime() };
}
