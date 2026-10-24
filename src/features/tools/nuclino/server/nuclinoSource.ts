import { z } from "zod";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { ToolSource, ToolWidget } from "@/features/tools/server/ToolSource";
import { isoToEpoch, makeItem, parseJson, truncate } from "@/features/tools/server/sourceUtils";

const WORKSPACE_CACHE_MS = 5 * 60_000;
const ITEMS_PER_WORKSPACE = 100;

// Shapes of `list_workspaces` and `list_items` / `search_items` output from Nuclino's MCP server.
const workspaceSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const itemSchema = z.array(
  z.object({
    type: z.string(),
    id: z.string(),
    workspaceId: z.string().optional(),
    title: z.string(),
    lastUpdatedAt: z.string().optional(),
  }),
);

type Workspace = z.infer<typeof workspaceSchema>[number];

/**
 * ### nuclinoUrl
 *
 * @returns The web link for an item, as Nuclino's MCP docs define it.
 */
export function nuclinoUrl(itemId: string): string {
  return `https://app.nuclino.com/t/b/${itemId}`;
}

/**
 * ### parseNuclinoItems
 *
 * Keeps documents (`type: "item"`) and drops collections.
 *
 * @param workspaceNames - Workspace id → name, for subtitles.
 * @returns Items in the order Nuclino returned them.
 * @throws Error When the output is not the expected JSON.
 */
function parseNuclinoItems(text: string, workspaceNames: Map<string, string>): Array<DashboardItem> {
  const parsed = itemSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Nuclino response: ${truncate(text, 200)}`);
  return parsed.data
    .filter((item) => item.type === "item")
    .map((item) =>
      makeItem({
        id: item.id,
        title: item.title || "(untitled)",
        subtitle: item.workspaceId === undefined ? undefined : workspaceNames.get(item.workspaceId),
        at: isoToEpoch(item.lastUpdatedAt),
        url: nuclinoUrl(item.id),
        delegatePrompt: [
          `Read the Nuclino doc "${item.title}" (id: ${item.id}) with the nuclino MCP and summarize the key points.`,
          "If there are follow-up tasks or related Linear issues, list those too.",
        ].join("\n"),
      }),
    );
}

const workspaceCache = new Map<string, { at: number; workspaces: Array<Workspace> }>();

async function workspaces(caller: ToolCaller, names: Array<string>): Promise<Array<Workspace>> {
  const cached = workspaceCache.get(caller.label);
  let all = cached !== undefined && Date.now() - cached.at < WORKSPACE_CACHE_MS ? cached.workspaces : undefined;
  if (all === undefined) {
    const parsed = workspaceSchema.safeParse(parseJson(await caller.callText("list_workspaces", { limit: 100 })));
    if (!parsed.success) throw new Error("Could not parse the Nuclino workspace list");
    all = parsed.data;
    workspaceCache.set(caller.label, { at: Date.now(), workspaces: all });
  }
  if (names.length === 0) return all;
  const chosen = all.filter((w) => names.includes(w.name));
  const missing = names.filter((n) => !all.some((w) => w.name === n));
  if (missing.length > 0) throw new Error(`Nuclino workspaces not found: ${missing.join(", ")}`);
  return chosen;
}

/**
 * ### fetchRecentNuclino
 *
 * Most recently updated documents across the chosen workspaces. Nuclino's
 * `list_items` returns at most 100 items per workspace in no date order, so
 * in large workspaces a recent document can be missed.
 *
 * @returns At most `limit` items, newest first.
 */
export async function fetchRecentNuclino(
  caller: ToolCaller,
  options: { workspaces: Array<string>; limit: number },
): Promise<Array<DashboardItem>> {
  const chosen = await workspaces(caller, options.workspaces);
  const names = new Map(chosen.map((w) => [w.id, w.name]));
  const lists = await Promise.all(
    chosen.map(async (w) =>
      parseNuclinoItems(await caller.callText("list_items", { workspaceId: w.id, limit: ITEMS_PER_WORKSPACE }), names),
    ),
  );
  return lists
    .flat()
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, options.limit);
}

/**
 * ### searchNuclino
 *
 * @returns Matching documents across the chosen workspaces.
 */
export async function searchNuclino(
  caller: ToolCaller,
  options: { workspaces: Array<string> },
  query: string,
): Promise<Array<DashboardItem>> {
  const chosen = await workspaces(caller, options.workspaces);
  const names = new Map(chosen.map((w) => [w.id, w.name]));
  const lists = await Promise.all(
    chosen.map(async (w) =>
      parseNuclinoItems(await caller.callText("search_items", { workspaceId: w.id, query, limit: 5 }), names),
    ),
  );
  return lists.flat().slice(0, 15);
}

/**
 * ### nuclinoToolSource
 *
 * Recently updated documents for the widget; search within the chosen workspaces.
 */
export const nuclinoToolSource: ToolSource<Extract<ToolWidget, { type: "nuclino" }>> = {
  note: "Shows the most recent of up to 100 docs per workspace",
  load: (caller, widget) => fetchRecentNuclino(caller, widget),
  search: (caller, widget, query) => searchNuclino(caller, widget, query),
};
