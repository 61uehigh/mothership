import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * ### appRoot
 *
 * Where mothership's own files live: scripts and the default config files.
 * `MOTHERSHIP_APP_ROOT` when set (a packaged app), else the project folder.
 */
export function appRoot(): string {
  return process.env.MOTHERSHIP_APP_ROOT || process.cwd();
}

/**
 * ### dataDir
 *
 * Where your own files live: config, `.env.local`, the session database, and
 * worktrees. `MOTHERSHIP_DATA_DIR` when set (a packaged app keeps it in
 * Application Support), else the project folder, as in development.
 */
export function dataDir(): string {
  return process.env.MOTHERSHIP_DATA_DIR || process.cwd();
}

/**
 * ### appPath
 *
 * @returns A path inside {@link appRoot}.
 */
export function appPath(...parts: Array<string>): string {
  // Not traced at build time: these folders are chosen at run time (see the packaged app).
  return path.join(/*turbopackIgnore: true*/ appRoot(), ...parts);
}

/**
 * ### dataPath
 *
 * @returns A path inside {@link dataDir}; use it for everything mothership writes.
 */
export function dataPath(...parts: Array<string>): string {
  return path.join(/*turbopackIgnore: true*/ dataDir(), ...parts);
}

/**
 * ### configPath
 *
 * A config file to read: your copy in `<dataDir>/config` when it exists,
 * else the default that ships with the app. Writes go to `dataPath("config", name)`.
 */
export function configPath(name: string): string {
  const yours = dataPath("config", name);
  return existsSync(yours) ? yours : appPath("config", name);
}

/**
 * ### workspaceDir
 *
 * The folder sessions work in until you choose a default folder in Settings:
 * `MOTHERSHIP_WORKSPACE`, else your home folder.
 */
export function workspaceDir(): string {
  // `||` on purpose: the .env template leaves it as an empty string.
  return process.env.MOTHERSHIP_WORKSPACE || homedir();
}
