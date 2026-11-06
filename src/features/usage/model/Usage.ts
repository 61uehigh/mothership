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
 * ### ProviderUsage
 *
 * Latest known limits for one provider. Values come from the provider's own
 * reports during runs, so they are as fresh as `observedAt`.
 */
export type ProviderUsage = {
  fiveHour: UsageWindow | undefined;
  weekly: UsageWindow | undefined;
  /** Epoch milliseconds the provider reported these numbers. */
  observedAt: number;
};

/**
 * ### UsageSnapshot
 *
 * Everything the status bar shows.
 */
export type UsageSnapshot = {
  claude: ProviderUsage | undefined;
  codex: ProviderUsage | undefined;
  /** Whole-machine CPU use since the previous snapshot, 0–100. */
  cpuPercent: number | undefined;
  /** Memory in use (excluding reclaimable cache on macOS), 0–100. */
  memoryPercent: number;
};
