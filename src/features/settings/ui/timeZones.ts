/*
 * The time zone picker's list: every IANA zone with a readable name and its
 * current UTC offset, sorted by offset, and the matching for its search box.
 * Pure, so it is tested without a browser.
 */

/**
 * ### TimeZoneOption
 *
 * One zone in the picker. `id` is the IANA id that is saved, unchanged.
 */
export interface TimeZoneOption {
  /** The IANA id, such as `Asia/Seoul`. */
  id: string;
  /** The city part, such as `Seoul` or `Indiana / Indianapolis`. */
  city: string;
  /** The region part, such as `Asia`; empty for ids like `UTC`. */
  region: string;
  /** Minutes ahead of UTC right now (negative behind it). */
  offsetMinutes: number;
  /** The offset as text, such as `UTC+09:00` or `UTC−03:30`. */
  offset: string;
}

/**
 * ### offsetMinutesOf
 *
 * How many minutes `zone` is ahead of UTC at `at`, read from `Intl`'s
 * `longOffset` name ("GMT+09:00", or plain "GMT" at zero).
 *
 * @returns The offset in minutes, or `0` when the zone is unknown.
 */
export function offsetMinutesOf(zone: string, at: Date): number {
  let name: string | undefined;
  try {
    name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value;
  } catch {
    return 0;
  }
  const match = /GMT([+-−])(\d{1,2})(?::?(\d{2}))?/.exec(name ?? "");
  if (match === null) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "+" ? minutes : -minutes;
}

/**
 * ### formatOffset
 *
 * `540` → `UTC+09:00`, `-210` → `UTC−03:30`, `0` → `UTC±00:00`.
 * A true minus sign, so the column of offsets lines up and reads as a number.
 */
export function formatOffset(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "±";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * ### describeZone
 *
 * Splits an IANA id into a readable city and region:
 * `America/Argentina/Buenos_Aires` → city `Argentina / Buenos Aires`, region `America`.
 */
export function describeZone(id: string, at: Date): TimeZoneOption {
  const parts = id.split("/").map((part) => part.replaceAll("_", " "));
  const region = parts.length > 1 ? (parts[0] ?? "") : "";
  const city = parts.length > 1 ? parts.slice(1).join(" / ") : (parts[0] ?? id);
  const offsetMinutes = offsetMinutesOf(id, at);
  return { id, city, region, offsetMinutes, offset: formatOffset(offsetMinutes) };
}

/**
 * ### zoneLabel
 *
 * The one-line name of a zone, as the closed picker shows it: `Seoul (UTC+09:00)`.
 */
export function zoneLabel(option: TimeZoneOption): string {
  return `${option.city} (${option.offset})`;
}

/**
 * ### listTimeZones
 *
 * Every zone in `ids`, plus `extra` ids missing from it (a saved zone this
 * browser does not list, or `UTC`), deduplicated and sorted west to east by
 * offset, then by region and city.
 */
export function listTimeZones(ids: ReadonlyArray<string>, extra: ReadonlyArray<string>, at: Date): Array<TimeZoneOption> {
  const unique = [...new Set([...ids, ...extra.filter((id) => id !== "")])];
  return unique
    .map((id) => describeZone(id, at))
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.region.localeCompare(b.region) || a.city.localeCompare(b.city));
}

/** Lowercase, with `_`, `/`, `-`, and runs of spaces folded to one space. */
const fold = (text: string) => text.toLowerCase().replace(/[_/\-−]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * ### matchesZone
 *
 * Whether a zone matches the search box. Every word must appear in the id,
 * city, or region; a word with a digit or a sign, such as `+9`, `utc+09`, or
 * `-3:30`, instead matches the offset, ignoring leading zeros.
 */
export function matchesZone(option: TimeZoneOption, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
  const haystack = fold(`${option.id} ${option.city} ${option.region}`);
  return words.every((word) => {
    const offset = /^(?:utc|gmt)?([+\-−±])(\d{1,2})(?::?(\d{2}))?$/.exec(word);
    if (offset !== null) {
      const minutes = Number(offset[2]) * 60 + Number(offset[3] ?? 0);
      if (offset[3] === undefined) {
        // "+9" matches +09:00 and +09:30; "+0" or "-0" match UTC itself.
        const hours = Math.trunc(option.offsetMinutes / 60);
        return minutes === 0 ? Math.abs(option.offsetMinutes) < 60 : hours === (offset[1] === "+" ? 1 : -1) * Number(offset[2]);
      }
      return option.offsetMinutes === (offset[1] === "+" ? minutes : -minutes);
    }
    return haystack.includes(fold(word));
  });
}
