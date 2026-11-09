import type { ActivityItem, ActivitySource, DayActivity } from "@/features/todos/model/Daily";
import { addDays, dayBounds, localDay } from "@/lib/dates";
import { HttpError } from "@/platform/http/HttpError";
import { errorMessage } from "@/lib/errors";

/**
 * ### ActivityLoader
 *
 * Loads one tool's activity in `[from, to)` (epoch milliseconds, the
 * midnights of `day` in the {@link DayClock}'s zone). Returns `[]` when the
 * tool is not set up.
 */
export type ActivityLoader = (range: { day: string; from: number; to: number }) => Promise<Array<ActivityItem>>;

/**
 * ### DayClock
 *
 * Where days begin and end. The composition root passes the dashboard's
 * time zone (Settings → General), which the calendar's day also uses, so a
 * meeting near midnight lands on the same day in both; without one, the
 * server's own zone.
 *
 * @property today - Today's date, `YYYY-MM-DD`.
 * @property bounds - Epoch milliseconds of the midnight starting `day` and the next one.
 */
export type DayClock = {
  today: () => Promise<string>;
  bounds: (day: string) => Promise<{ from: number; to: number }>;
};

const LOCAL_CLOCK: DayClock = {
  today: async () => localDay(Date.now()),
  bounds: async (day) => dayBounds(day),
};

const TODAY_TTL_MS = 5 * 60_000;
const PAST_TTL_MS = 60 * 60_000;
const MAX_CACHED_DAYS = 14;

/**
 * ### DailyService
 *
 * What you did on a day according to your tools (pull requests, Linear,
 * sessions, meetings), for the Daily tab and the standup. Each tool is a
 * loader passed in by the composition root; one failing becomes a problem
 * next to the others' items. Days are cached a few minutes (today) or an
 * hour (past days, which change little).
 */
export class DailyService {
  readonly #loaders: Partial<Record<ActivitySource, ActivityLoader>>;
  readonly #clock: DayClock;
  readonly #cache = new Map<string, { at: number; value: DayActivity }>();

  constructor(loaders: Partial<Record<ActivitySource, ActivityLoader>>, clock: DayClock = LOCAL_CLOCK) {
    this.#loaders = loaders;
    this.#clock = clock;
  }

  /**
   * ### activity
   *
   * @param day - A date in the clock's zone, `YYYY-MM-DD`; a future day has only meetings.
   * @param refresh - Skip the cache.
   */
  async activity(day: string, refresh: boolean): Promise<DayActivity> {
    const now = Date.now();
    const today = await this.#clock.today();
    const hit = this.#cache.get(day);
    const ttl = day >= today ? TODAY_TTL_MS : PAST_TTL_MS;
    if (!refresh && hit !== undefined && now - hit.at < ttl) return hit.value;

    const range = { day, ...(await this.#clock.bounds(day)) };
    const entries = Object.entries(this.#loaders) as Array<[ActivitySource, ActivityLoader]>;
    const settled = await Promise.allSettled(entries.map(([, load]) => load(range)));
    const value: DayActivity = { day, items: [], problems: [] };
    settled.forEach((outcome, index) => {
      const source = entries[index]![0];
      if (outcome.status === "fulfilled") value.items.push(...outcome.value.filter((item) => item.at >= range.from && item.at < range.to));
      // A tool that is not set up (409) has nothing to say; that is not a problem.
      else if (!(outcome.reason instanceof HttpError && outcome.reason.status === 409)) value.problems.push({ source, message: errorMessage(outcome.reason) });
    });
    value.items.sort((a, b) => a.at - b.at);

    this.#cache.set(day, { at: now, value });
    // Forget days far from today so the cache stays small.
    const oldest = addDays(today, -MAX_CACHED_DAYS);
    for (const key of this.#cache.keys()) if (key < oldest) this.#cache.delete(key);
    return value;
  }
}
