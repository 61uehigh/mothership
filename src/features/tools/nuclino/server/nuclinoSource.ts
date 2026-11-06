import { z } from "zod";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { ToolSource, ToolWidget } from "@/features/tools/server/ToolSource";
import { makeItem, nuclinoDocPrompt } from "@/features/tools/model/dashboardItem";
import { isoToEpoch, parseJson, truncate } from "@/features/tools/server/sourceUtils";
import { noteListedItems } from "@/features/tools/nuclino/server/nuclinoMeetings";
import { processState } from "@/platform/processState";
import { nuclinoUrl } from "@/features/tools/model/toolUrls";

const WORKSPACE_CACHE_MS = 30 * 60_000;
/** The same search typed again (or retyped after a typo) within this reuses the answer. */
const SEARCH_CACHE_MS = 2 * 60_000;
const SEARCH_CACHE_MAX = 50;
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

type ListedItem = z.infer<typeof itemSchema>[number];

/** @throws Error When the output is not the expected JSON. */
function parseNuclinoListing(text: string): Array<ListedItem> {
  const parsed = itemSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Nuclino response: ${truncate(text, 200)}`);
  return parsed.data;
}

/**
 * Documents (`type: "item"`) as rows, collections dropped, in Nuclino's order.
 *
 * @param workspaceNames - Workspace id → name, for subtitles.
 */
function documentRows(listed: Array<ListedItem>, workspaceNames: Map<string, string>): Array<DashboardItem> {
  return listed
    .filter((item) => item.type === "item")
    .map((item) =>
      makeItem({
        id: item.id,
        title: item.title,
        subtitle: item.workspaceId === undefined ? undefined : workspaceNames.get(item.workspaceId),
        at: isoToEpoch(item.lastUpdatedAt),
        url: nuclinoUrl(item.id),
        delegatePrompt: nuclinoDocPrompt(item),
      }),
    );
}

/** Lists items with `tool` in each workspace, telling the meeting list's cache what it saw. */
async function listInWorkspaces(caller: ToolCaller, chosen: Array<Workspace>, tool: string, args: Record<string, unknown>): Promise<Array<DashboardItem>> {
  const names = new Map(chosen.map((w) => [w.id, w.name]));
  const lists = await Promise.all(
    chosen.map(async (w) => {
      const listed = parseNuclinoListing(await caller.callText(tool, { workspaceId: w.id, ...args }));
      noteListedItems(listed);
      return documentRows(listed, names);
    }),
  );
  return lists.flat();
}

const workspaceCache = processState("nuclino.workspaces", () => new Map<string, { at: number; workspaces: Array<Workspace> }>());

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
  return (await listInWorkspaces(caller, chosen, "list_items", { limit: ITEMS_PER_WORKSPACE }))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, options.limit);
}

const searchCache = processState("nuclino.searches", () => new Map<string, { at: number; items: Array<DashboardItem> }>());

/**
 * ### searchNuclino
 *
 * Each search costs a call per workspace, so an answer is reused for two
 * minutes.
 *
 * @returns Matching documents across the chosen workspaces.
 */
export async function searchNuclino(
  caller: ToolCaller,
  options: { workspaces: Array<string> },
  query: string,
): Promise<Array<DashboardItem>> {
  const key = JSON.stringify([caller.label, options.workspaces, query.trim().toLowerCase()]);
  const cached = searchCache.get(key);
  if (cached !== undefined && Date.now() - cached.at < SEARCH_CACHE_MS) return cached.items;
  const items = await searchWorkspaces(caller, options, query);
  searchCache.delete(key);
  searchCache.set(key, { at: Date.now(), items });
  // Maps iterate oldest first; drop the oldest beyond the cap.
  for (const old of searchCache.keys()) {
    if (searchCache.size <= SEARCH_CACHE_MAX) break;
    searchCache.delete(old);
  }
  return items;
}

async function searchWorkspaces(caller: ToolCaller, options: { workspaces: Array<string> }, query: string): Promise<Array<DashboardItem>> {
  const chosen = await workspaces(caller, options.workspaces);
  return (await listInWorkspaces(caller, chosen, "search_items", { query, limit: 5 })).slice(0, 15);
}

/**
 * ### nuclinoToolSource
 *
 * Recently updated documents for the widget; search within the chosen workspaces.
 */
export const nuclinoToolSource: ToolSource<Extract<ToolWidget, { type: "nuclino" }>> = {
  note: "nuclino-recent",
  // Each load is a call per workspace, from the same per-account limit as meeting notes and agents.
  minRefreshSeconds: 600,
  load: (caller, widget) => fetchRecentNuclino(caller, widget),
  search: (caller, widget, query) => searchNuclino(caller, widget, query),
};
