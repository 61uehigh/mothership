import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### FilesError
 *
 * A request the file service refuses. `status` is the HTTP status the route
 * should answer with; the message is safe to show the user.
 */
export class FilesError extends HttpError {
  /**
   * @param status - HTTP status: 400 (bad path), 403 (secret path), 404
   *   (unknown root or file), 415 (binary file), 501 (not macOS).
   */
  constructor(message: string, status: number) {
    super(message, status);
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

/**
 * ### resolveInside
 *
 * @returns The absolute path of `relative` inside `dir`.
 * @throws {@link FilesError} 400 when the path (or a symlink in it) leads outside `dir`.
 */
export async function resolveInside(dir: string, relative: string): Promise<string> {
  const outside = new FilesError("The path is outside the folder being browsed", 400);
  const isInside = (base: string, target: string) => {
    const rel = path.relative(base, target);
    // `..notes` is a name inside; only `..` itself or `../…` leads out.
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  };
  const target = path.resolve(dir, relative);
  if (path.isAbsolute(relative) || !isInside(dir, target)) throw outside;
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new FilesError(`${relative} does not exist`, 404);
  }
  if (!isInside(await realpath(dir), real)) throw outside;
  return real;
}
