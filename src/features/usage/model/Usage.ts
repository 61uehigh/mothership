/**
 * ### UsageWindow
 *
 * One rate-limit window of a subscription, e.g. Claude's 5-hour window.
 */
export type UsageWindow = {
  /** 0–100. */
  usedPercent: number;
  /** Epoch milliseconds when the window resets; `undefined` when unknown. */
  resetsAt: number | undefined;
};

/**
 * ### LimitWindow
 *
 * A {@link UsageWindow} with its name, for showing every window a provider
 * reports (5-hour, weekly, weekly for one model, …).
 */
export type LimitWindow = UsageWindow & {
  /** The provider's own key, e.g. `five_hour`, `seven_day_opus`, or Codex's `primary`. */
  id: string;
  /** For people, e.g. "5-hour" or "Weekly (Opus)". */
  label: string;
};

/**
 * ### ProviderUsage
 *
 * Latest known limits for one provider. Values come from the provider's own
 * reports during runs, so they are as fresh as `observedAt`.
 */
export type ProviderUsage = {
  fiveHour: UsageWindow | undefined;
  weekly: UsageWindow | undefined;
  /** Every window reported, the 5-hour and weekly ones included, shortest first. */
  windows: Array<LimitWindow>;
  /** Epoch milliseconds the provider reported these numbers. */
  observedAt: number;
};

/**
 * ### USAGE_STALE_MS
 *
 * Limits older than this are shown dimmed as stale.
 */
export const USAGE_STALE_MS = 60 * 60_000;

/**
 * ### isUsageStale
 *
 * @returns Whether `usage` is missing or older than {@link USAGE_STALE_MS} at `now`.
 */
export function isUsageStale(usage: ProviderUsage | undefined, now: number): boolean {
  return usage === undefined || now - usage.observedAt > USAGE_STALE_MS;
}

/**
 * ### windowLabel
 *
 * @param minutes - A window's length.
 * @returns "5-hour", "Weekly", "Daily", or the length in hours or days.
 */
export function windowLabel(minutes: number): string {
  if (minutes === 7 * 24 * 60) return "Weekly";
  if (minutes === 24 * 60) return "Daily";
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-minute`;
}

/**
 * ### UsageSnapshot
 *
 * Everything the status bar shows, and the Usage page of Settings in more detail.
 */
export type UsageSnapshot = {
  claude: ProviderUsage | undefined;
  codex: ProviderUsage | undefined;
  /** Whole-machine CPU use since the previous snapshot, 0–100. */
  cpuPercent: number | undefined;
  /** Memory in use (excluding reclaimable cache on macOS), 0–100. */
  memoryPercent: number;
};

/**
 * ### windowsOf
 *
 * @returns Every window of `usage`, shortest first. Falls back to the 5-hour
 *   and weekly ones for numbers recorded before windows were kept by name.
 */
export function windowsOf(usage: ProviderUsage): Array<LimitWindow> {
  if (Array.isArray(usage.windows)) return usage.windows;
  const named: Array<[string, string, UsageWindow | undefined]> = [
    ["five_hour", "5-hour", usage.fiveHour],
    ["seven_day", "Weekly", usage.weekly],
  ];
  return named.flatMap(([id, label, window]) => (window === undefined ? [] : [{ id, label, ...window }]));
}
