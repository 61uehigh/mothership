import { readFile } from "node:fs/promises";
import { dump, load } from "js-yaml";
import { z } from "zod";
import { writeFileAtomic, writeQueueFor } from "@/platform/files";
import { dataPath } from "@/platform/paths";

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

const fileSchema = z.object({ overrides: z.record(z.string(), z.array(keyBindingSchema)).default({}) });

/**
 * ### KeyOverrides
 *
 * Your shortcuts by command id; an empty list turns a command's shortcut off.
 */
export type KeyOverrides = Record<string, Array<string>>;

function parseOverrides(text: string): KeyOverrides {
  try {
    return fileSchema.parse(load(text) ?? {}).overrides;
  } catch {
    // Missing or hand-broken file: fall back to defaults rather than breaking every shortcut.
    return {};
  }
}

/**
 * ### readKeyOverrides
 *
 * @returns The overrides in `config/keybindings.yaml`, or none when it is missing or broken.
 */
export async function readKeyOverrides(): Promise<KeyOverrides> {
  return parseOverrides(await readFile(file(), "utf8").catch(() => ""));
}

/**
 * ### setKeyOverride
 *
 * Rewrites `config/keybindings.yaml` with one command's keys changed,
 * keeping the comment block at its top (comments further down belong to
 * old entries and are dropped).
 *
 * @param keys - The new keys; `null` restores the default.
 * @returns All overrides as saved.
 */
export function setKeyOverride(id: string, keys: Array<string> | null): Promise<KeyOverrides> {
  return writeQueueFor(file())(async () => {
    const original = await readFile(file(), "utf8").catch(() => "");
    const overrides = parseOverrides(original);
    if (keys === null) delete overrides[id];
    else overrides[id] = keys;
    const header = original.split("\n").filter((line, i, all) => line.startsWith("#") && all.slice(0, i).every((l) => l.startsWith("#"))).join("\n");
    await writeFileAtomic(file(), `${header}${header === "" ? "" : "\n"}${dump({ overrides }, { lineWidth: 120 })}`);
    return overrides;
  });
}
