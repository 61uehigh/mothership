import type { DashboardItem } from "@/features/tools/model/Dashboard";

/**
 * ### makeItem
 *
 * Builds a {@link DashboardItem} with every optional field defaulted, so
 * sources only spell out what they know.
 *
 * @returns A complete item.
 */
export function makeItem(
  fields: Pick<DashboardItem, "id" | "title" | "delegatePrompt"> & Partial<DashboardItem>,
): DashboardItem {
  return {
    subtitle: undefined,
    meta: undefined,
    at: undefined,
    url: undefined,
    secondaryLink: undefined,
    badge: undefined,
    highlighted: false,
    muted: false,
    ...fields,
  };
}

/**
 * ### parseJson
 *
 * @returns The parsed value, or `undefined` when `text` is not JSON.
 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Callers treat non-JSON output as a format error with their own message.
    return undefined;
  }
}

/**
 * ### truncate
 *
 * @returns `text` cut to `max` characters with an ellipsis when longer.
 */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * ### zonedDate
 *
 * @returns The calendar date of `epochMs` in `timeZone`, as `YYYY-MM-DD`.
 */
export function zonedDate(epochMs: number, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    epochMs,
  );
}

/**
 * ### addDays
 *
 * @param date - `YYYY-MM-DD`.
 * @returns The date `days` later, as `YYYY-MM-DD`.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * ### zonedTime
 *
 * @returns `HH:mm` of `epochMs` in `timeZone`, 24-hour.
 */
export function zonedTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    epochMs,
  );
}

/**
 * ### mentionLink
 *
 * A mention as a Markdown link with the `mention:` scheme, which the
 * Markdown renderer draws as a highlighted name: `mention:me` for you,
 * `mention:other` for anyone else.
 *
 * @param name - Shown after `@`; a leading `@` is dropped.
 */
export function mentionLink(name: string, mine: boolean, withAt = true): string {
  const label = name.replace(/^@/, "").replace(/[[\]]/g, "");
  return `[${withAt ? "@" : ""}${label}](mention:${mine ? "me" : "other"})`;
}

/**
 * ### linkMentions
 *
 * Turns plain `@handle` mentions in Markdown into {@link mentionLink}s,
 * outside code. Used for Linear, whose comments mention people by username.
 *
 * @param me - Your handle, compared case-insensitively.
 */
export function linkMentions(markdown: string, me: string | undefined): string {
  const mine = me?.toLowerCase();
  // Odd parts are fenced code blocks or inline code, left untouched.
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/(^|[\s(])@([A-Za-z0-9][\w.-]*[\w])/g, (_, before: string, handle: string) => before + mentionLink(handle, handle.toLowerCase() === mine)),
    )
    .join("");
}

/**
 * ### highlightNames
 *
 * Marks plain-text occurrences of your names as `mention:me` links, outside
 * code and existing links. Nuclino exports mentions as plain names, and
 * people often write each other's names in Slack and Linear too.
 *
 * @param names - From `me.names` in `config/dashboard.yaml`; longer names win.
 */
export function highlightNames(markdown: string, names: Array<string>): string {
  if (names.length === 0 || markdown === "") return markdown;
  const pattern = new RegExp(
    [...names]
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g",
  );
  // Odd parts are code, Markdown links (including mentions already made), or bare URLs: left untouched.
  return markdown
    .split(/(```[\s\S]*?```|`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\)|<https?:[^>\s]+>|https?:\/\/\S+)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(pattern, (name) => mentionLink(name, true, false))))
    .join("");
}

/**
 * ### tsToEpoch
 *
 * A Slack message timestamp (`1792659089.594709`) is exact epoch seconds, so
 * it gives the time without parsing Slack's display time and its time-zone
 * abbreviation.
 *
 * @returns Epoch milliseconds, or `undefined` for anything that is not a Slack ts.
 */
export function tsToEpoch(ts: string | undefined): number | undefined {
  if (ts === undefined || !/^\d+\.\d+$/.test(ts)) return undefined;
  return Math.round(Number(ts) * 1000);
}

/**
 * ### isoToEpoch
 *
 * Parses an ISO 8601 timestamp (or a bare `YYYY-MM-DD`, read as UTC midnight).
 *
 * @returns Epoch milliseconds, or `undefined` when missing or unparseable.
 */
export function isoToEpoch(iso: string | null | undefined): number | undefined {
  if (iso === null || iso === undefined) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * ### zonedMidnight
 *
 * @param date - `YYYY-MM-DD`.
 * @returns Epoch milliseconds of 00:00 on `date` in `timeZone`.
 */
export function zonedMidnight(date: string, timeZone: string): number {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  // The zone's offset at that moment: how far its wall clock is from UTC.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utcMidnight);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return utcMidnight - (wall - utcMidnight);
}
