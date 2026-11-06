import { z } from "zod";

/**
 * ### ENTRY_PATHS
 *
 * How you got to a feature: a sidebar section, the tab strip or a tab's
 * content, the title bar, the command center, a keyboard shortcut, a browser
 * notification, a link (a deep link or one inside a session), or something
 * the app did by itself.
 */
export const ENTRY_PATHS = ["sidebar", "tab", "titlebar", "statusbar", "palette", "shortcut", "notification", "link", "other"] as const;

/**
 * ### EntryPath
 *
 * One of {@link ENTRY_PATHS}.
 */
export type EntryPath = (typeof ENTRY_PATHS)[number];

/**
 * ### USE_KINDS
 *
 * What a recorded use was: opening a tab (`open:<kind>`, `open:section:<id>`),
 * running a command (`command:<id>`), or pressing a labelled button (`action:<label>`).
 */
export const USE_KINDS = ["open", "command", "action"] as const;

/**
 * ### FeatureUse
 *
 * One use of a feature, recorded on this Mac only.
 */
export type FeatureUse = {
  kind: (typeof USE_KINDS)[number];
  /** The feature, e.g. `pr`, `section:slack`, `new-session`, `Reply`. */
  feature: string;
  /** Where on screen it happened, e.g. `sidebar:slack`, `tab:pr`, `titlebar`. */
  area: string;
  via: EntryPath;
  /** Epoch milliseconds. */
  at: number;
  /** Your local date, `YYYY-MM-DD`. */
  day: string;
};

/**
 * ### ActiveTime
 *
 * Seconds of active use (window in front, input within the last minute) in
 * one area on one day.
 */
export type ActiveTime = { day: string; area: string; seconds: number };

/**
 * ### usageBatchSchema
 *
 * What the browser sends to record: uses and active time since the last send.
 */
export const usageBatchSchema = z.object({
  uses: z
    .array(
      z.object({
        kind: z.enum(USE_KINDS),
        feature: z.string().min(1).max(120),
        area: z.string().max(80),
        via: z.enum(ENTRY_PATHS),
        at: z.number().int().nonnegative(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .max(500),
  active: z
    .array(
      z.object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        area: z.string().max(80),
        seconds: z.number().int().positive().max(24 * 60 * 60),
      }),
    )
    .max(200),
});

/**
 * ### UsageBatch
 *
 * See {@link usageBatchSchema}.
 */
export type UsageBatch = z.infer<typeof usageBatchSchema>;

/**
 * ### FeatureStats
 *
 * How often one feature was used in the period, and by which entry paths.
 */
export type FeatureStats = {
  kind: FeatureUse["kind"];
  feature: string;
  count: number;
  via: Partial<Record<EntryPath, number>>;
  /** Epoch milliseconds of the most recent use. */
  lastAt: number;
};

/**
 * ### UsageStats
 *
 * The Insights tab's numbers for a period, oldest day first.
 */
export type UsageStats = {
  /** The first day counted, `YYYY-MM-DD`. */
  since: string;
  activeSeconds: number;
  byDay: Array<{ day: string; seconds: number }>;
  byArea: Array<{ area: string; seconds: number }>;
  features: Array<FeatureStats>;
};

/**
 * ### localDay
 *
 * @returns The local calendar date of `epochMs` as `YYYY-MM-DD`.
 */
export function localDay(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
