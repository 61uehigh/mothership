/**
 * ### relativeTime
 *
 * @param epochMs - Any timestamp; past and future both work.
 * @param now - The reference time, passed in so callers control re-rendering.
 * @returns Short English relative time such as "just now", "5m ago", or "in 1h" ("soon" for under a minute ahead).
 */
export function relativeTime(epochMs: number, now: number): string {
  const future = epochMs > now;
  const format = (amount: string): string => (future ? `in ${amount}` : `${amount} ago`);
  const minutes = Math.floor(Math.abs(now - epochMs) / 60_000);
  if (minutes < 1) return future ? "soon" : "just now";
  if (minutes < 60) return format(`${minutes}m`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format(`${hours}h`);
  return format(`${Math.floor(hours / 24)}d`);
}

/**
 * ### errorMessage
 *
 * @param error - Anything a `catch` received.
 * @returns The message of an `Error`, otherwise the value as a string.
 */
export function errorMessage(error: unknown): string {
  return errorMessage(error);
}

/**
 * ### formatDuration
 *
 * @param ms - A length of time; negative counts as zero.
 * @returns The two largest units, e.g. "2h 13m", "3d 4h", "45m", or "under 1m".
 */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(ms, 0) / 60_000);
  if (minutes < 1) return "under 1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

/**
 * ### formatBytes
 *
 * @param bytes - A size in bytes.
 * @returns Binary units as macOS Activity Monitor shows memory, e.g. "12.3 GB", "512 MB".
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // One decimal below 100 (12.3 GB), none above (512 MB), none for bytes.
  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
