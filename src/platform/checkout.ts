import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * ### isMothershipCheckout
 *
 * @returns Whether `dir` is a git checkout of mothership itself (its
 *   `package.json` is named `mothership`).
 */
export function isMothershipCheckout(dir: string): boolean {
  try {
    if (!existsSync(path.join(/*turbopackIgnore: true*/ dir, ".git"))) return false;
    const manifest: unknown = JSON.parse(readFileSync(path.join(/*turbopackIgnore: true*/ dir, "package.json"), "utf8"));
    return typeof manifest === "object" && manifest !== null && "name" in manifest && manifest.name === "mothership";
  } catch {
    return false;
  }
}

/**
 * ### runningCheckout
 *
 * @returns The checkout this server runs from (`pnpm dev`), or `undefined`
 *   for the desktop app, which runs a built copy.
 */
export function runningCheckout(): string | undefined {
  const dir = process.cwd();
  return process.env.MOTHERSHIP_DATA_DIR === undefined && isMothershipCheckout(dir) ? dir : undefined;
}
