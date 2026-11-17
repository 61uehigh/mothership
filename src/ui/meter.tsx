/**
 * ### WARNING_PERCENT
 *
 * At or above this, a meter turns yellow as a warning.
 */
export const WARNING_PERCENT = 70;
/**
 * ### DANGER_PERCENT
 *
 * At or above this, a meter turns red.
 */
export const DANGER_PERCENT = 90;

/**
 * ### MeterLevel
 *
 * How full a meter is: fine, a warning (from {@link WARNING_PERCENT}), or a danger (from {@link DANGER_PERCENT}).
 */
export type MeterLevel = "ok" | "warning" | "danger";

/**
 * ### meterLevel
 *
 * @param percent - 0–100.
 * @returns The level whose colors the meter takes.
 */
export function meterLevel(percent: number): MeterLevel {
  if (percent >= DANGER_PERCENT) return "danger";
  if (percent >= WARNING_PERCENT) return "warning";
  return "ok";
}

/**
 * ### METER_BAR_COLOR
 *
 * The filled part of a meter, by level.
 */
export const METER_BAR_COLOR: Record<MeterLevel, string> = { ok: "bg-teal-500", warning: "bg-yellow-400", danger: "bg-red-500" };
/**
 * ### METER_TEXT_COLOR
 *
 * The number beside a meter, by level, so the level reads at a glance even on a small bar.
 */
export const METER_TEXT_COLOR: Record<MeterLevel, string> = { ok: "", warning: "text-amber-700 dark:text-yellow-400", danger: "text-red-600 dark:text-red-400" };

/**
 * ### MeterBar
 *
 * A horizontal bar filled to `percent`, colored by {@link meterLevel}. Empty
 * when the percent is unknown.
 *
 * @param className - Size of the track, e.g. `h-1.5 w-12`.
 * @param level - Overrides the color, for a meter where full is good (a battery).
 */
export function MeterBar({ percent, className, level }: { percent: number | undefined; className: string; level?: MeterLevel }) {
  return (
    <span className={`block overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${className}`}>
      {percent !== undefined && <span className={`block h-full ${METER_BAR_COLOR[level ?? meterLevel(percent)]}`} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />}
    </span>
  );
}

/**
 * ### MeterPercent
 *
 * The number for a meter, colored by its level; "–" when unknown.
 */
export function MeterPercent({ percent, className = "" }: { percent: number | undefined; className?: string }) {
  return (
    <span className={`font-mono tabular-nums ${percent === undefined ? "" : METER_TEXT_COLOR[meterLevel(percent)]} ${className}`}>
      {percent === undefined ? "–" : `${percent}%`}
    </span>
  );
}
