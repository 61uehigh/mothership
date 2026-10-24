import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { dataPath } from "@/platform/paths";
import { CONNECTIONS } from "@/features/settings/model/Settings";

const file = () => dataPath(".mothership", "settings.json");

const storedSettingsSchema = z.object({
  /** Set when you finish the welcome steps, so Settings stops opening on start. */
  setupDone: z.boolean().default(false),
  /** The folder a new session works in when you leave its folder empty. */
  defaultFolder: z.string().optional(),
  /** Your choice per tool; a tool you have not chosen for follows the config files. */
  connections: z.partialRecord(z.enum(CONNECTIONS), z.enum(["mcp", "claude", "off"])).default({}),
  /** Overrides for `config/dashboard.yaml`; unset fields keep the file's values. */
  profile: z
    .object({
      names: z.array(z.string().min(2)).optional(),
      slackUserId: z.string().optional(),
      timezone: z.string().optional(),
    })
    .default({}),
});

/**
 * ### StoredSettings
 *
 * What the Settings screen saves in `.mothership/settings.json` (git-ignored).
 * Secrets never go here; they go to `.env.local`.
 */
export type StoredSettings = z.infer<typeof storedSettingsSchema>;

const EMPTY: StoredSettings = { setupDone: false, connections: {}, profile: {} };

/**
 * ### readSettings
 *
 * Read fresh on every call, like the config files, so a change applies at once.
 *
 * @returns The saved settings; defaults when the file is missing or broken.
 */
export async function readSettings(): Promise<StoredSettings> {
  try {
    return storedSettingsSchema.parse(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    // Missing or hand-broken file: fall back to the config files rather than failing.
    return EMPTY;
  }
}

/** The chain of pending writes, so two quick changes cannot overwrite each other. */
let writes: Promise<unknown> = Promise.resolve();

/**
 * ### updateSettings
 *
 * @param change - Returns the new settings from the current ones.
 * @returns The settings as saved.
 */
export function updateSettings(change: (settings: StoredSettings) => StoredSettings): Promise<StoredSettings> {
  const result = writes.then(async () => {
    const next = storedSettingsSchema.parse(change(await readSettings()));
    await mkdir(path.dirname(file()), { recursive: true });
    // A temporary file and a rename, so a crash never leaves a half-written file.
    const temporary = `${file()}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
    await rename(temporary, file());
    return next;
  });
  writes = result.catch(() => undefined);
  return result;
}
