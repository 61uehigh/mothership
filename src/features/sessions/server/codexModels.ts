import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ModelOption } from "@/features/sessions/model/Lead";

const cacheSchema = z.object({
  models: z.array(
    z.object({
      slug: z.string(),
      display_name: z.string().optional(),
      visibility: z.string().optional(),
      priority: z.number().optional(),
    }),
  ),
});

/**
 * ### parseCodexModels
 *
 * The models Codex lists in its own picker, best first, from the model list
 * Codex keeps in `~/.codex/models_cache.json`. Hidden models are left out.
 *
 * @returns An empty list for a file in any other shape.
 */
export function parseCodexModels(raw: unknown): Array<ModelOption> {
  const parsed = cacheSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.models
    .filter((model) => model.visibility === undefined || model.visibility === "list")
    .toSorted((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
    .map((model) => ({ id: model.slug, label: model.display_name ?? model.slug }));
}

/**
 * ### codexModels
 *
 * Codex refreshes this list itself whenever it runs, so it follows your
 * account's models without mothership knowing their names.
 *
 * @returns The models Codex offers on this Mac; empty before Codex has run once.
 */
export async function codexModels(): Promise<Array<ModelOption>> {
  try {
    return parseCodexModels(JSON.parse(await readFile(path.join(homedir(), ".codex", "models_cache.json"), "utf8")));
  } catch {
    return [];
  }
}
