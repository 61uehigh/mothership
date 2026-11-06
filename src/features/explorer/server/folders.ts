import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { FilesErrorCode } from "@/features/explorer/model/Files";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### FilesError
 *
 * A request the file service refuses. `status` is the HTTP status the route
 * should answer with; the Explorer words `code`, and the message is the
 * English fallback.
 */
export class FilesError extends HttpError {
  /**
   * @param status - HTTP status: 400 (bad path), 403 (secret path), 404
   *   (unknown root or file), 413 (too large), 415 (binary or unviewable file).
   */
  constructor(message: string, status: number, code: FilesErrorCode) {
    super(message, status, code);
    this.name = "FilesError";
  }
}

/**
 * ### isDirectory
 *
 * @returns Whether `dir` exists and is a folder.
 */
export async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

const outsideError = () => new FilesError("The path is outside the folder being browsed", 400, "path-outside");

function isInside(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  // `..notes` is a name inside; only `..` itself or `../…` leads out.
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * ### resolveInside
 *
 * @returns The absolute path of `relative` inside `dir`.
 * @throws {@link FilesError} 400 when the path (or a symlink in it) leads outside `dir`.
 */
export async function resolveInside(dir: string, relative: string): Promise<string> {
  const outside = outsideError();
  const target = path.resolve(dir, relative);
  if (path.isAbsolute(relative) || !isInside(dir, target)) throw outside;
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new FilesError(`${relative} does not exist`, 404, "path-missing");
  }
  if (!isInside(await realpath(dir), real)) throw outside;
  return real;
}

/**
 * ### resolveInsideAny
 *
 * An absolute path (a file link in an agent's reply) checked against several
 * folders by where it really is, so a symlink such as macOS's `/tmp` →
 * `/private/tmp` is followed and one pointing outside is refused. Folders that
 * don't exist are skipped.
 *
 * @returns The real path when it lies inside one of `dirs`.
 * @throws {@link FilesError} 404 when the path does not exist, 400 when it is outside all of `dirs`.
 */
export async function resolveInsideAny(dirs: ReadonlyArray<string>, absolute: string): Promise<string> {
  let real: string;
  try {
    real = await realpath(absolute);
  } catch {
    throw new FilesError(`${absolute} does not exist`, 404, "path-missing");
  }
  const bases = await Promise.all(dirs.map((dir) => realpath(dir).catch(() => undefined)));
  if (!bases.some((base) => base !== undefined && isInside(base, real))) throw outsideError();
  return real;
}
