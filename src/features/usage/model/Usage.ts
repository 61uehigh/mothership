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
 * A {@link UsageWindow} with what the UI names it by, for showing every
 * window a provider reports (5-hour, weekly, weekly for one model, …).
 */
export type LimitWindow = UsageWindow & {
  /** The provider's own key, e.g. `five_hour`, `seven_day_opus`, or Codex's `primary`; named from this alone when `minutes` is unknown. */
  id: string;
  /** The window's length, e.g. 300 for 5-hour and 10080 for weekly; `undefined` for a window the app does not know yet. */
  minutes: number | undefined;
  /** The one model a per-model window counts, as the provider names it, e.g. `Opus`. */
  model?: string;
  /** What else limits the window: only OAuth apps' use (`apps`), or use including extra usage (`extra-usage`). */
  scope?: "apps" | "extra-usage";
};

/**
 * ### sameWindow
 *
 * Whether two windows count the same thing under different keys, e.g. a
 * `rate_limit_event`'s `seven_day_opus` and a `/usage` read's `model_opus`.
 */
export function sameWindow(a: LimitWindow, b: LimitWindow): boolean {
  if (a.id === b.id) return true;
  if (a.minutes === undefined || b.minutes === undefined) return false;
  return a.minutes === b.minutes && a.model?.toLowerCase() === b.model?.toLowerCase() && a.scope === b.scope;
}

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
  /**
   * The subscription plan as the provider names it, e.g. Codex's `plus` or
   * `self_serve_business_prolite`, Claude's `team`; `undefined` when not reported.
   */
  plan: string | undefined;
  /** Epoch milliseconds the provider reported these numbers. */
  observedAt: number;
};

/**
 * ### hasFiveHourLimit
 *
 * Whether to show a 5-hour meter for `usage`. Codex reports every window its
 * plan has in each record, so a record with windows but no 5-hour one means
 * a weekly-only plan (Pro, Business, …). Decided from the windows rather than
 * from a list of plan names, which Codex changes.
 *
 * @returns `true` while nothing is known (no numbers, or a record without
 *   windows), so the meter keeps its place with "–"; otherwise whether a
 *   5-hour window was reported.
 */
export function hasFiveHourLimit(usage: ProviderUsage | undefined): boolean {
  if (usage === undefined || usage.fiveHour !== undefined) return true;
  return usage.windows.length === 0;
}

/**
 * ### planLabel
 *
 * @param plan - A plan as the provider names it, e.g. `self_serve_business_prolite`.
 * @returns A name for people, e.g. "Business Prolite"; `undefined` for none.
 */
export function planLabel(plan: string | undefined): string | undefined {
  const words = plan
    ?.replace(/^self_serve_/, "")
    .split(/[_\s-]+/)
    .filter((w) => w !== "");
  if (words === undefined || words.length === 0) return undefined;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

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
