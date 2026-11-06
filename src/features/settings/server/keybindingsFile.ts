import { copyFile, readFile } from "node:fs/promises";
import { dump, load } from "js-yaml";
import { z } from "zod";
import { writeFileAtomic, writeQueueFor } from "@/platform/files";
import { dataPath } from "@/platform/paths";
import { isMissingFile } from "@/lib/errors";

const file = () => dataPath("config", "keybindings.yaml");

/** One step, `mod+shift+alt+key` with the modifiers in any order. */
const STEP = /^((mod|shift|alt)\+)*([a-z0-9]|[/.,[\]]|enter|escape|up|down|left|right|space|backspace)$/;

/**
 * ### keyBindingSchema
 *
 * A shortcut of one or two steps, such as `mod+k` or `g s`.
 */
export const keyBindingSchema = z.string().refine((binding) => {
  const steps = binding.split(" ");
  return steps.length <= 2 && steps.every((step) => STEP.test(step));
}, "invalid key binding");

const bindingsSchema = z.array(keyBindingSchema);

/**
 * ### KeyOverrides
 *
 * Your shortcuts by command id; an empty list turns a command's shortcut off.
 */
export type KeyOverrides = Record<string, Array<string>>;

/**
 * ### parseKeyOverrides
 *
 * Reads `keybindings.yaml`'s text entry by entry, so one invalid binding
 * drops only its own command's override.
 *
 * @returns The valid overrides, and whether anything was dropped (an
 *   invalid entry, or text that is not YAML with an `overrides` map).
 */
export function parseKeyOverrides(text: string): { overrides: KeyOverrides; dropped: boolean } {
  // js-yaml throws on a document with no content, which a missing file or one with only comments is.
  if (text.split("\n").every((line) => line.trim() === "" || line.trim().startsWith("#"))) return { overrides: {}, dropped: false };
  let raw: unknown;
  try {
    raw = load(text) ?? {};
  } catch {
    return { overrides: {}, dropped: true };
  }
  const saved = typeof raw === "object" && raw !== null && "overrides" in raw ? (raw.overrides ?? {}) : {};
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return { overrides: {}, dropped: true };
  const overrides: KeyOverrides = {};
  let dropped = false;
  for (const [id, keys] of Object.entries(saved)) {
    const parsed = bindingsSchema.safeParse(keys);
    if (parsed.success) overrides[id] = parsed.data;
    else dropped = true;
  }
  return { overrides, dropped };
}

/**
 * ### readKeyOverrides
 *
 * @returns The valid overrides in `config/keybindings.yaml`, or none when it is missing or unreadable.
 */
export async function readKeyOverrides(): Promise<KeyOverrides> {
  return parseKeyOverrides(await readFile(file(), "utf8").catch(() => "")).overrides;
}

/**
 * ### setKeyOverride
 *
 * Rewrites `config/keybindings.yaml` with one command's keys changed,
 * keeping the comment block at its top (comments further down belong to
 * old entries and are dropped). When the file had anything that did not
 * parse, it is first copied to `keybindings.yaml.bad-<ms>`.
 *
 * @param keys - The new keys; `null` restores the default.
 * @returns All overrides as saved.
 * @throws When the file exists but cannot be read; nothing is written then.
 */
export function setKeyOverride(id: string, keys: Array<string> | null): Promise<KeyOverrides> {
  return writeQueueFor(file())(async () => {
    const original = await readFile(file(), "utf8").catch((error: unknown) => {
      if (isMissingFile(error)) return "";
      throw error;
    });
    const { overrides, dropped } = parseKeyOverrides(original);
    if (dropped) await copyFile(file(), `${file()}.bad-${Date.now()}`);
    if (keys === null) delete overrides[id];
    else overrides[id] = keys;
    const header = original.split("\n").filter((line, i, all) => line.startsWith("#") && all.slice(0, i).every((l) => l.startsWith("#"))).join("\n");
    await writeFileAtomic(file(), `${header}${header === "" ? "" : "\n"}${dump({ overrides }, { lineWidth: 120 })}`);
    return overrides;
  });
}
