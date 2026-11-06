import { z } from "zod";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import { ToolNotFoundError, type ToolCaller } from "@/platform/mcp/ToolCaller";
import type { ToolSource, ToolWidget } from "@/features/tools/server/ToolSource";
import { isoToEpoch, makeItem, parseJson, truncate } from "@/features/tools/server/sourceUtils";

/**
 * ### viaConnector
 *
 * Notion has two backends with different tools: the open-source Notion MCP
 * server run with your integration token (`API-*` tools, raw API JSON) and
 * the claude.ai connector (`notion-*` tools, its own JSON).
 *
 * @returns Whether `caller` relays to the claude.ai connector.
 */
export function viaConnector(caller: ToolCaller): boolean {
  return caller.label.startsWith("connector:");
}

/**
 * ### notionUrl
 *
 * @returns A web link for a page id, for when the tool gives none.
 */
export function notionUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

// The API answers errors as `{ status: "error", code, message }` text rather than a failed call.
const apiErrorSchema = z.object({ status: z.literal("error"), code: z.string().optional(), message: z.string().optional() });

/**
 * ### parseNotionApi
 *
 * @returns The parsed JSON of an `API-*` tool's output.
 * @throws ToolNotFoundError When Notion answers `object_not_found` (also
 *   what it says for a page not shared with your integration).
 * @throws Error For any other error answer.
 */
export function parseNotionApi(text: string): unknown {
  const json = parseJson(text);
  const failed = apiErrorSchema.safeParse(json);
  if (!failed.success) return json;
  const message = `Notion: ${failed.data.message ?? failed.data.code ?? "request failed"}`;
  if (failed.data.code === "object_not_found") throw new ToolNotFoundError(message);
  throw new Error(message);
}

/**
 * ### apiPropertiesSchema
 *
 * A Notion API page's `properties`, as far as finding its title needs.
 */
export const apiPropertiesSchema = z
  .record(z.string(), z.object({ type: z.string(), title: z.array(z.object({ plain_text: z.string() })).optional() }).loose())
  .default({});

// A page object from the Notion API, as far as the list needs it.
const apiPageSchema = z.object({
  object: z.string(),
  id: z.string(),
  url: z.string().optional(),
  last_edited_time: z.string().optional(),
  in_trash: z.boolean().optional(),
  properties: apiPropertiesSchema,
});
const apiSearchSchema = z.object({ results: z.array(z.unknown()) });

/**
 * ### apiPageTitle
 *
 * @returns The text of the page's title property; a database row names it
 *   whatever the database calls it, so it is found by type.
 */
export function apiPageTitle(page: { properties: z.infer<typeof apiPropertiesSchema> }): string {
  const title = Object.values(page.properties).find((p) => p.type === "title");
  return (title?.title ?? []).map((t) => t.plain_text).join("").trim();
}

/** Parses `API-post-search` output; results that are not pages are skipped. */
function parseApiPages(text: string): Array<z.infer<typeof apiPageSchema>> {
  const parsed = apiSearchSchema.safeParse(parseNotionApi(text));
  if (!parsed.success) throw new Error(`Could not parse the Notion response: ${truncate(text, 200)}`);
  return parsed.data.results.flatMap((result) => {
    const page = apiPageSchema.safeParse(result);
    return page.success && page.data.object === "page" && page.data.in_trash !== true ? [page.data] : [];
  });
}

// One result of the connector's `notion-search` or `notion-list-recent-pages`.
const connectorPageSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  type: z.string().nullish(),
  timestamp: z.string().nullish(),
});
const connectorListSchema = z.object({ results: z.array(z.unknown()) });

function parseConnectorPages(text: string): Array<z.infer<typeof connectorPageSchema>> {
  const parsed = connectorListSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Notion response: ${truncate(text, 200)}`);
  return parsed.data.results.flatMap((result) => {
    const page = connectorPageSchema.safeParse(result);
    // Databases and users are listed too; only pages open here.
    return page.success && (page.data.type ?? "page") === "page" ? [page.data] : [];
  });
}

function pageItem(id: string, title: string, url: string | undefined, at: number | undefined): DashboardItem {
  const name = title || "(untitled)";
  return makeItem({
    id,
    title: name,
    at,
    url: url ?? notionUrl(id),
    delegatePrompt: [`Read the Notion page "${name}" (id: ${id}) with the notion MCP and summarize the key points.`, "If there are follow-up tasks, list those too."].join("\n"),
  });
}

/**
 * ### fetchRecentNotion
 *
 * Through your token: the pages shared with your integration, most recently
 * edited first. Through the claude.ai connector: the pages you viewed
 * lately, as Notion ranks them.
 *
 * @returns At most `limit` pages.
 */
export async function fetchRecentNotion(caller: ToolCaller, options: { limit: number }): Promise<Array<DashboardItem>> {
  if (viaConnector(caller)) {
    const pages = parseConnectorPages(await caller.callText("notion-list-recent-pages", { limit: options.limit }));
    return pages.slice(0, options.limit).map((p) => pageItem(p.id, p.title ?? "", p.url ?? undefined, isoToEpoch(p.timestamp)));
  }
  const text = await caller.callText("API-post-search", {
    filter: { property: "object", value: "page" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: options.limit,
  });
  return parseApiPages(text).map((p) => pageItem(p.id, apiPageTitle(p), p.url, isoToEpoch(p.last_edited_time)));
}

/**
 * ### searchNotion
 *
 * Through your token, Notion matches titles only; the connector also
 * searches page content.
 *
 * @returns Matching pages.
 */
export async function searchNotion(caller: ToolCaller, query: string): Promise<Array<DashboardItem>> {
  if (viaConnector(caller)) {
    const pages = parseConnectorPages(await caller.callText("notion-search", { query, page_size: 10, max_highlight_length: 0 }));
    return pages.map((p) => pageItem(p.id, p.title ?? "", p.url ?? undefined, isoToEpoch(p.timestamp)));
  }
  const text = await caller.callText("API-post-search", { query, filter: { property: "object", value: "page" }, page_size: 10 });
  return parseApiPages(text).map((p) => pageItem(p.id, apiPageTitle(p), p.url, isoToEpoch(p.last_edited_time)));
}

/**
 * ### notionToolSource
 *
 * Recent pages for the widget; search across what the backend can see.
 */
export const notionToolSource: ToolSource<Extract<ToolWidget, { type: "notion" }>> = {
  note: "With a token, lists only the pages shared with your integration",
  load: (caller, widget) => fetchRecentNotion(caller, widget),
  search: (caller, _widget, query) => searchNotion(caller, query),
};
