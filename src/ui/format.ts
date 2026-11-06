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
