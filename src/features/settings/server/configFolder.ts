import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { HttpError } from "@/platform/http/HttpError";
import { appPath, dataPath } from "@/platform/paths";

const run = promisify(execFile);

/**
 * ### openConfigFolder
 *
 * Opens your config folder in Finder, creating it if it does not exist yet
 * (a packaged app keeps it in Application Support) and adding the example
 * files to start from.
 *
 * @returns The folder's path.
 * @throws {@link HttpError} 501 off macOS.
 */
export async function openConfigFolder(): Promise<string> {
  if (process.platform !== "darwin") throw new HttpError("Opening Finder is only supported on macOS", 501);
  const folder = dataPath("config");
  await mkdir(folder, { recursive: true });
  // Examples to copy from, next to your own files (a packaged app keeps its defaults inside itself).
  const defaults = appPath("config");
  if (defaults !== folder) {
    for (const name of (await readdir(/*turbopackIgnore: true*/ defaults).catch(() => [])).filter((n) => n.endsWith(".example.yaml"))) {
      await copyFile(/*turbopackIgnore: true*/ path.join(defaults, name), path.join(folder, name), constants.COPYFILE_EXCL).catch(() => {
        // Already there.
      });
    }
  }
  await run("open", [folder]);
  return folder;
}
