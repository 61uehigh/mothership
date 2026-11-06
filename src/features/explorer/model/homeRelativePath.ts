/**
 * ### homeRelativePath
 *
 * The path of the folder `absolute` relative to `home`, with `/` between
 * folders, for the explorer's local mode. Both may use either separator, so
 * a Windows path such as `C:\Users\me\code\x` works too; a trailing
 * separator on `home` is ignored.
 *
 * @returns `""` for home itself, or `undefined` when `absolute` is outside home.
 */
export function homeRelativePath(absolute: string, home: string): string | undefined {
  const target = absolute.replaceAll("\\", "/");
  const base = home.replaceAll("\\", "/").replace(/\/+$/, "");
  if (target === base) return "";
  return target.startsWith(`${base}/`) ? target.slice(base.length + 1) : undefined;
}
