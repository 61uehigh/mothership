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
  return error instanceof Error ? error.message : String(error);
}
