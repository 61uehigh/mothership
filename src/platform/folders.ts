import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * ### expandHome
 *
 * @returns `dir` with a leading `~` (alone or before `/`) replaced by your home folder; any other path unchanged.
 */
export function expandHome(dir: string): string {
  return dir === "~" || dir.startsWith("~/") ? path.join(homedir(), dir.slice(1)) : dir;
}

/**
 * ### folderProblem
 *
 * Why `dir` can't be worked in: it is relative (so it would resolve against
 * the server's own folder), or there is no folder there.
 *
 * @returns The problem's code, or `undefined` when `dir` is an existing folder.
 */
export async function folderProblem(dir: string): Promise<"folder-not-absolute" | "folder-missing" | undefined> {
  if (!path.isAbsolute(dir)) return "folder-not-absolute";
  const isFolder = await stat(/*turbopackIgnore: true*/ dir).then(
    (s) => s.isDirectory(),
    () => false,
  );
  return isFolder ? undefined : "folder-missing";
}
