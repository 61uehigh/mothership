import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dump, load } from "js-yaml";
import { connection } from "next/server";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { dataPath } from "@/platform/paths";

const file = () => dataPath("config", "keybindings.yaml");
// One or two steps, each `mod+shift+alt+key` in any order of modifiers.
const STEP = /^((mod|shift|alt)\+)*([a-z0-9]|[/.,[\]]|enter|escape|up|down|left|right|space|backspace)$/;
const bindingSchema = z.string().refine((b) => {
  const steps = b.split(" ");
  return steps.length <= 2 && steps.every((s) => STEP.test(s));
}, "invalid key binding");

const fileSchema = z.object({ overrides: z.record(z.string(), z.array(bindingSchema)).default({}) });
const putSchema = z.object({ id: z.string().min(1), keys: z.array(bindingSchema).max(3).nullable() });

/** The chain of pending writes; each PUT waits for the previous one. */
let writes: Promise<unknown> = Promise.resolve();

async function read(): Promise<Record<string, Array<string>>> {
  try {
    return fileSchema.parse(load(await readFile(file(), "utf8")) ?? {}).overrides;
  } catch {
    // Missing or hand-broken file: fall back to defaults rather than breaking every shortcut.
    return {};
  }
}

/**
 * ### GET
 *
 * @returns `{ overrides }`: command id → keys.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ overrides: await read() });
}

/**
 * ### PUT
 *
 * Sets one command's keys (`keys: []` turns it off), or restores the default
 * with `keys: null`. Rewrites `config/keybindings.yaml`, keeping its header.
 *
 * @returns The updated `{ overrides }`, or 400 for an invalid binding.
 */
export async function PUT(request: Request): Promise<Response> {
  const body = await parseBody(request, putSchema);
  if (body instanceof Response) return body;
  const { id, keys } = body;
  // One write at a time, so two quick rebinds cannot overwrite each other.
  const result = writes.then(async () => {
    const original = await readFile(file(), "utf8").catch(() => "");
    let overrides: Record<string, Array<string>>;
    try {
      overrides = fileSchema.parse(load(original) ?? {}).overrides;
    } catch {
      overrides = {};
    }
    if (keys === null) delete overrides[id];
    else overrides[id] = keys;
    // The comment block at the top of the file; comments further down belong to old entries.
    const header = original.split("\n").filter((line, i, all) => line.startsWith("#") && all.slice(0, i).every((l) => l.startsWith("#"))).join("\n");
    // Write a temporary file and rename it, so a crash never leaves a half-written file.
    await mkdir(path.dirname(file()), { recursive: true });
    const temporary = `${file()}.${process.pid}.tmp`;
    await writeFile(temporary, `${header}${header === "" ? "" : "\n"}${dump({ overrides }, { lineWidth: 120 })}`);
    await rename(temporary, file());
    return overrides;
  });
  writes = result.catch(() => undefined);
  return Response.json({ overrides: await result });
}
