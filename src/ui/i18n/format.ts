"use client";

import { useMemo } from "react";
import type { Locale } from "@/ui/i18n/translate";
import { useLocale } from "@/ui/i18n/useT";

/**
 * ### dateLocale
 *
 * The `Intl` locale for dates and numbers in `locale`, for `toLocaleString` and friends.
 */
export function dateLocale(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : "en-US";
}

/**
 * Joins the words of one time label. A label such as "5분 전" or "2h 13m" that
 * broke across lines in a narrow row read as two values, so it never breaks.
 */
const NBSP = "\u00a0";

/** How each language writes amounts of time; one rule set below serves both. */
type TimeWords = {
  minutes: (n: number) => string;
  hours: (n: number) => string;
  days: (n: number) => string;
  underAMinute: string;
  ago: (amount: string) => string;
  in: (amount: string) => string;
  justNow: string;
  soon: string;
};

const TIME_WORDS: Record<Locale, TimeWords> = {
  en: {
    minutes: (n) => `${n}m`,
    hours: (n) => `${n}h`,
    days: (n) => `${n}d`,
    underAMinute: `under${NBSP}1m`,
    ago: (amount) => `${amount}${NBSP}ago`,
    in: (amount) => `in${NBSP}${amount}`,
    justNow: `just${NBSP}now`,
    soon: "soon",
  },
  ko: {
    minutes: (n) => `${n}분`,
    hours: (n) => `${n}시간`,
    days: (n) => `${n}일`,
    underAMinute: `1분${NBSP}미만`,
    ago: (amount) => `${amount}${NBSP}전`,
    in: (amount) => `${amount}${NBSP}후`,
    justNow: "방금",
    soon: "곧",
  },
};

/**
 * ### relativeTimeIn
 *
 * A short relative time in `locale`: "5m ago" or "5분 전", "in 1h" or
 * "1시간 후", "just now" or "방금" under a minute ("soon" or "곧" ahead).
 * Its words are joined with no-break spaces, so it never wraps.
 *
 * @param epochMs - Any timestamp; past and future both work.
 * @param now - The reference time, passed in so callers control re-rendering.
 */
export function relativeTimeIn(locale: Locale, epochMs: number, now: number): string {
  const words = TIME_WORDS[locale];
  const future = epochMs > now;
  const minutes = Math.floor(Math.abs(now - epochMs) / 60_000);
  if (minutes < 1) return future ? words.soon : words.justNow;
  const hours = Math.floor(minutes / 60);
  const amount = minutes < 60 ? words.minutes(minutes) : hours < 24 ? words.hours(hours) : words.days(Math.floor(hours / 24));
  return future ? words.in(amount) : words.ago(amount);
}

/**
 * ### durationIn
 *
 * A length of time in `locale`, by its two largest units with a zero second
 * unit dropped: "2h 13m" or "2시간 13분", "3d 4h", "45m", "under 1m". Joined
 * with no-break spaces, so it never wraps.
 *
 * @param ms - A length of time; negative counts as zero.
 */
export function durationIn(locale: Locale, ms: number): string {
  const words = TIME_WORDS[locale];
  const minutes = Math.floor(Math.max(ms, 0) / 60_000);
  if (minutes < 1) return words.underAMinute;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${words.days(days)}${NBSP}${words.hours(hours)}` : words.days(days);
  if (hours > 0) return rest > 0 ? `${words.hours(hours)}${NBSP}${words.minutes(rest)}` : words.hours(hours);
  return words.minutes(rest);
}

/**
 * ### useFormat
 *
 * Time and date formatting in the chosen language, for components.
 *
 * @returns `relativeTime` and `duration` bound to the language, and the
 *   `Intl` locale (`dateLocale`) for `toLocaleString` calls.
 */
export function useFormat(): { relativeTime: (epochMs: number, now: number) => string; duration: (ms: number) => string; dateLocale: string } {
  const { locale } = useLocale();
  return useMemo(
    () => ({
      relativeTime: (epochMs: number, now: number) => relativeTimeIn(locale, epochMs, now),
      duration: (ms: number) => durationIn(locale, ms),
      dateLocale: dateLocale(locale),
    }),
    [locale],
  );
}
