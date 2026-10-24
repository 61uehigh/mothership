import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { configPath } from "@/platform/paths";

const configSchema = z.object({ repositories: z.array(z.string().min(1)).default([]) });

/**
 * ### loadRepositories
 *
 * Reads `config/repositories.yaml` fresh on every call so edits apply without
 * a restart. A missing or invalid file means no extra repositories.
 *
 * @returns Absolute directories, with a leading `~` expanded, in file order.
 */
export async function loadRepositories(): Promise<Array<string>> {
  let raw: unknown;
  try {
    raw = load(await readFile(configPath("repositories.yaml"), "utf8"));
  } catch {
    // The file is optional.
    return [];
  }
  const parsed = configSchema.safeParse(raw ?? {});
  if (!parsed.success) return [];
  return parsed.data.repositories.map((dir) => path.resolve(dir.replace(/^~(?=$|\/)/, homedir())));
}
