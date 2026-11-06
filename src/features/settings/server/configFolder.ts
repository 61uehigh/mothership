import { constants } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { openIn } from "@/platform/desktop/desktop";
import { appPath, dataPath } from "@/platform/paths";

/**
 * ### openConfigFolder
 *
 * Opens your config folder in Finder or File Explorer, creating it if it does not exist yet
 * (a packaged app keeps it in Application Support) and adding the example
 * files to start from.
 *
 * @returns The folder's path.
 * @throws {@link HttpError} 501 on systems other than macOS and Windows.
 */
export async function openConfigFolder(): Promise<string> {
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
  await openIn("finder", folder);
  return folder;
}
