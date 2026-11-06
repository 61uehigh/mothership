/** A Windows path with a drive letter: `C:\…` or `C:/…`. */
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * ### relativeInside
 *
 * The part of `file` below `dir`, for showing a path relative to a session's
 * folder. Works in the browser, where `node:path` is not available, and with
 * both `/` and `\` separators, since a session on Windows reports
 * `C:\Users\me\app\src\a.ts`. Windows paths compare without case.
 *
 * @returns The rest of `file` as written (its own separators), `""` for `dir`
 *   itself, or `undefined` when `file` is not inside `dir`.
 */
export function relativeInside(dir: string, file: string): string | undefined {
  const base = dir.replaceAll("\\", "/").replace(/\/+$/, "");
  const target = file.replaceAll("\\", "/");
  const fold = DRIVE_PATH.test(base) ? (p: string) => p.toLowerCase() : (p: string) => p;
  if (fold(target.replace(/\/+$/, "")) === fold(base)) return "";
  return fold(target).startsWith(`${fold(base)}/`) ? file.slice(base.length + 1) : undefined;
}

/**
 * ### FileLink
 *
 * A link to a local file, as agents write them in replies.
 */
export type FileLink = {
  /** The file, without its line suffix. */
  path: string;
  /** The line the link points at (`:44` or `#L44`). */
  line: number | undefined;
  /** No root: the path is relative to the folder the agent works in. */
  relative: boolean;
};

/** `name:12` (a relative file and line) reads like a URL scheme, but is not one. */
const SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:(?!\d+(?::\d+)?(?:#|$))/;

/**
 * ### fileLink
 *
 * Reads a link href as a local file: absolute (`/Users/me/a.ts:44`,
 * `C:\x\a.ts`, `file:///Users/me/a.ts#L44`, `file:///C:/x/a.ts`) or relative
 * (`src/a.ts:44`, `./a.ts#L44`, `a.ts:12`).
 *
 * @returns The file and line, or `undefined` for a web link, an anchor, a
 *   query, a protocol-relative URL, or an href that does not decode.
 */
export function fileLink(href: string): FileLink | undefined {
  let raw: string;
  let relative = false;
  if (href.startsWith("file://")) {
    // `file:///C:/x` names the path `/C:/x`; the drive letter starts a Windows path.
    raw = href.slice("file://".length).replace(/^\/(?=[A-Za-z]:[\\/])/, "");
  } else if ((href.startsWith("/") && !href.startsWith("//")) || DRIVE_PATH.test(href)) {
    raw = href;
  } else if (href !== "" && !/^[#?]|^\/\/|^\\\\/.test(href) && !SCHEME.test(href)) {
    raw = href.replace(/^\.[\\/]/, "");
    relative = true;
  } else {
    return undefined;
  }
  const hash = /#L(\d+)/.exec(raw);
  let file: string;
  try {
    file = decodeURIComponent(raw.replace(/#.*$/, ""));
  } catch {
    return undefined;
  }
  const suffix = /:(\d+)(?::\d+)?$/.exec(file);
  const line = Number(suffix?.[1] ?? hash?.[1] ?? 0);
  const path = suffix === null ? file : file.slice(0, suffix.index);
  if (path === "") return undefined;
  return { path, line: line > 0 ? line : undefined, relative };
}

/**
 * ### keepFileHref
 *
 * Whether an href is a local file link that a URL sanitizer would drop for
 * looking like an unknown scheme: a Windows drive path (`C:\x\a.ts`) or a
 * relative file name with an extension and a line (`a.ts:12`). Nothing else
 * passes, so a `javascript:` URL can never get through as a "file".
 */
export function keepFileHref(href: string): boolean {
  return DRIVE_PATH.test(href) || /^[\w-]+\.[\w.-]+:\d+(?::\d+)?$/.test(href);
}

/**
 * ### baseName
 *
 * @returns The last segment of a `/` or `\` path, ignoring a trailing
 *   separator; the path itself when it has no segment (`/`).
 */
export function baseName(file: string): string {
  return file.split(/[\\/]/).filter(Boolean).at(-1) ?? file;
}
