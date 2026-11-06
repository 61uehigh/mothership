import { execFile } from "node:child_process";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { LOCAL_ROOT } from "@/features/explorer/model/Files";
import type { DirectoryEntry, DirectoryListing, FileContent, FileListing } from "@/features/explorer/model/Files";
import { FilesError, isDirectory, resolveInside } from "@/features/explorer/server/folders";
import { gitFiles, gitStatus, MAX_FILES, walk } from "@/features/explorer/server/gitListing";
import { highlight } from "@/features/explorer/server/highlight";
import { isSecretPath } from "@/features/explorer/server/secretPaths";
import { repoRoot } from "@/platform/git";

const run = promisify(execFile);
const MAX_CONTENT_BYTES = 1024 * 1024;

/** macOS `open` arguments per app; the path is appended. Finder reveals files and opens folders. */
const OPENERS = { terminal: ["-a", "Terminal"], vscode: ["-a", "Visual Studio Code"], finder: [] } as const;

/** Files the viewer can show as they are (not as text), by extension. */
const RAW_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  md: "text/plain; charset=utf-8",
  markdown: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
const RAW_MAX_BYTES = 50 * 1024 * 1024;

/**
 * ### RawFile
 *
 * A file's bytes for the viewer, with the type to serve them as.
 */
export type RawFile = { body: Blob; contentType: string };

/**
 * ### FileRoots
 *
 * Where each `root` parameter points, besides the home folder.
 */
export type FileRoots = {
  /** The default folder sessions work in, for `root=workspace`. */
  workspace: () => Promise<string>;
  /** A session's working folder by its id, or `undefined` for an unknown session. */
  sessionFolder: (id: string) => string | undefined;
};

/**
 * ### FileService
 *
 * Reads and lists files for the Explorer and file tabs, under a root: a
 * session's folder, the workspace, or the home folder. Secret paths are
 * refused everywhere, and nothing outside the root can be reached.
 */
export class FileService {
  readonly #roots: FileRoots;

  constructor(roots: FileRoots) {
    this.#roots = roots;
  }

  /**
   * Maps a `root` parameter to an absolute directory.
   *
   * @param root - A session id (its working folder), `"workspace"`, or {@link LOCAL_ROOT} (the home folder).
   * @throws {@link FilesError} 404 for an unknown session or a folder that no longer exists.
   */
  async #resolveRoot(root: string): Promise<string> {
    let dir: string | undefined;
    if (root === LOCAL_ROOT) dir = homedir();
    else if (root === "workspace") dir = await this.#roots.workspace();
    else {
      dir = this.#roots.sessionFolder(root);
      if (dir === undefined) throw new FilesError(`Unknown session ${root}`, 404);
    }
    if (!(await isDirectory(dir))) throw new FilesError(`The folder ${dir} no longer exists`, 404);
    return path.resolve(dir);
  }

  /**
   * ### listFiles
   *
   * Lists the files under `root`: tracked and untracked-but-not-ignored files
   * when it is in a git repository, otherwise a bounded walk that skips
   * dependency and build folders. At most 20,000 files.
   *
   * @throws {@link FilesError} 404 for an unknown root.
   */
  async listFiles(root: string): Promise<FileListing> {
    if (root === LOCAL_ROOT) throw new FilesError("The home folder is too large to list at once; browse it folder by folder", 400);
    const dir = await this.#resolveRoot(root);
    if ((await repoRoot(dir)) === undefined) return { root: dir, files: (await walk(dir)).filter((f) => !isSecretPath(f)), status: {} };
    const [listed, status] = await Promise.all([gitFiles(dir), gitStatus(dir)]);
    // `--cached` lists a conflicted file once per stage; de-duplicate.
    const files = [...new Set(listed.filter((f) => f !== "" && !isSecretPath(f)))].sort().slice(0, MAX_FILES);
    return { root: dir, files, status };
  }

  /**
   * ### readFileContent
   *
   * Reads a text file under `root` and highlights it with Shiki. Files over
   * 1 MB are cut to their first 1 MB.
   *
   * @throws {@link FilesError} 400 for paths outside the root, 404 for missing
   *   files, 415 for binary files.
   */
  async readFileContent(root: string, relative: string): Promise<FileContent> {
    const dir = await this.#resolveRoot(root);
    const file = await resolveInside(dir, relative);
    if (isSecretPath(file)) throw new FilesError(`${relative} may contain secrets, so it isn't shown here`, 403);
    const info = await stat(file);
    if (!info.isFile()) throw new FilesError(`${relative} is not a file`, 404);

    const truncated = info.size > MAX_CONTENT_BYTES;
    const handle = await open(file, "r");
    let buffer: Buffer;
    try {
      const chunk = Buffer.alloc(Math.min(info.size, MAX_CONTENT_BYTES));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, 0);
      buffer = chunk.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
    if (buffer.includes(0)) throw new FilesError(`${relative} looks like a binary file and can't be previewed`, 415);

    const code = buffer.toString("utf8");
    const { language, html } = await highlight(code, relative);

    let status: string | undefined;
    if ((await repoRoot(dir)) !== undefined) {
      const relativeToDir = path.relative(dir, path.resolve(dir, relative)).split(path.sep).join("/");
      const fileStatus: Record<string, string> = await gitStatus(dir, relativeToDir).catch(() => ({}));
      status = fileStatus[relativeToDir];
    }

    const lines = code === "" ? 0 : code.split("\n").length - (code.endsWith("\n") ? 1 : 0);
    return { path: relative, language, html, lines, truncated, status };
  }

  /**
   * ### listDirectory
   *
   * One folder's direct children, for Finder-style browsing. Hidden entries
   * (dot files) are left out unless asked for; secret paths never appear.
   *
   * @param relative - Folder relative to the root; `""` for the root itself.
   * @throws {@link FilesError} 404 for an unknown root; see {@link resolveInside}; 404 when it is not a folder.
   */
  async listDirectory(root: string, relative: string, showHidden: boolean): Promise<DirectoryListing> {
    const base = await this.#resolveRoot(root);
    const dir = relative === "" ? base : await resolveInside(base, relative);
    if (!(await isDirectory(dir))) throw new FilesError(`${relative} is not a folder`, 404);
    if (isSecretPath(dir)) throw new FilesError(`${relative} may contain secrets, so it isn't shown here`, 403);

    const dirents = await readdir(dir, { withFileTypes: true });
    const entries = await Promise.all(
      dirents
        .filter((d) => (showHidden || !d.name.startsWith(".")) && !isSecretPath(path.join(dir, d.name)))
        .map(async (d): Promise<DirectoryEntry | undefined> => {
          const child = relative === "" ? d.name : `${relative}/${d.name}`;
          try {
            // stat follows symlinks, so a link to a folder lists as a folder.
            const info = await stat(path.join(dir, d.name));
            return {
              name: d.name,
              path: child,
              kind: info.isDirectory() ? "dir" : "file",
              size: info.isDirectory() ? undefined : info.size,
              modifiedAt: info.mtimeMs,
            };
          } catch {
            // Broken symlink or permission denied: leave it out.
            return undefined;
          }
        }),
    );
    const sorted = entries
      .filter((e): e is DirectoryEntry => e !== undefined)
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.kind === "dir" ? -1 : 1));
    // `dir` is the resolved real path; report the path as browsed so it lines up with `relative`.
    return { absolute: relative === "" ? base : path.join(base, relative), path: relative, entries: sorted };
  }

  /**
   * ### openPath
   *
   * Opens a folder (or, for Finder, reveals a file) under the root in a
   * desktop app on this Mac. Terminal opens the file's folder when given a file.
   *
   * @throws {@link FilesError} See {@link resolveInside}; 403 for secret paths; 501 off macOS.
   */
  async openPath(root: string, relative: string, app: keyof typeof OPENERS): Promise<void> {
    if (process.platform !== "darwin") throw new FilesError("Opening apps is only supported on macOS", 501);
    const base = await this.#resolveRoot(root);
    const target = relative === "" ? base : await resolveInside(base, relative);
    if (isSecretPath(target)) throw new FilesError(`${relative} may contain secrets, so it can't be opened from here`, 403);
    const folder = await isDirectory(target);
    const args =
      app === "finder"
        ? folder
          ? [target]
          : ["-R", target]
        : [...OPENERS[app], folder || app === "vscode" ? target : path.dirname(target)];
    await run("open", args);
  }

  /**
   * ### readRawFile
   *
   * Reads a file the viewer shows as it is: images, PDFs, audio and video, and
   * text or Markdown to render. Secret paths are refused like everywhere else.
   *
   * @throws {@link FilesError} 400/404 like {@link readFileContent}; 403 for a
   *   secret path; 413 over 50 MB; 415 for a type the viewer cannot show.
   */
  async readRawFile(root: string, relative: string): Promise<RawFile> {
    const dir = await this.#resolveRoot(root);
    const file = await resolveInside(dir, relative);
    if (isSecretPath(file)) throw new FilesError(`${relative} may contain secrets, so it isn't shown here`, 403);
    const contentType = RAW_TYPES[path.extname(file).slice(1).toLowerCase()];
    if (contentType === undefined) throw new FilesError(`${relative} is not a file type the viewer can show`, 415);
    const info = await stat(file);
    if (info.size > RAW_MAX_BYTES) throw new FilesError(`${relative} is larger than 50 MB`, 413);
    return { body: new Blob([await readFile(file)], { type: contentType }), contentType };
  }
}
