/**
 * ### LOCAL_ROOT
 *
 * The explorer `root` value for browsing the user's home folder like Finder.
 * Paths are relative to the home folder, so nothing outside it can be reached.
 */
export const LOCAL_ROOT = "local";

/**
 * ### FileListing
 *
 * Response of `GET /api/files`.
 */
export type FileListing = {
  /**
   * ### root
   *
   * Absolute directory being listed.
   */
  root: string;
  /**
   * ### files
   *
   * Paths relative to `root`, `/`-separated.
   */
  files: Array<string>;
  /**
   * ### status
   *
   * Path (relative to `root`) → porcelain code such as `M`, `A`, `D`, `R`, or `??`.
   */
  status: Record<string, string>;
};

/**
 * ### FileContent
 *
 * Response of `GET /api/files/content`.
 */
export type FileContent = {
  /**
   * ### path
   *
   * The requested path, relative to the root.
   */
  path: string;
  /**
   * ### language
   *
   * Shiki language id, or `text` when unknown.
   */
  language: string;
  /**
   * ### html
   *
   * Shiki HTML with dual-theme CSS variables (`--shiki-light`, `--shiki-dark`).
   */
  html: string;
  /**
   * ### lines
   *
   * Number of lines rendered.
   */
  lines: number;
  /**
   * ### truncated
   *
   * The file is over 1 MB and only its first 1 MB is shown.
   */
  truncated: boolean;
  /**
   * ### status
   *
   * Porcelain git status of this file, or `undefined` when unchanged or not in git.
   */
  status: string | undefined;
};

/**
 * ### DirectoryEntry
 *
 * One item of a folder listing.
 */
export type DirectoryEntry = {
  name: string;
  /** Relative to the root, `/`-separated. */
  path: string;
  kind: "dir" | "file";
  /** Bytes; `undefined` for folders. */
  size: number | undefined;
  /** Epoch milliseconds. */
  modifiedAt: number;
};

/**
 * ### DirectoryListing
 *
 * Response of `GET /api/files/dir`.
 */
export type DirectoryListing = {
  /** Absolute folder being listed (as browsed, symlinks not resolved). */
  absolute: string;
  /** The folder relative to the root; `""` is the root itself. */
  path: string;
  /** Folders first, then files, each by name. */
  entries: Array<DirectoryEntry>;
};
