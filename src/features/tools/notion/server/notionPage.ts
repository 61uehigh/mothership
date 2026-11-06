import { z } from "zod";
import type { NotionPage } from "@/features/tools/model/Tools";
import { notFoundOn, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { apiPageTitle, apiPropertiesSchema, notionUrl, parseNotionApi, viaConnector } from "@/features/tools/notion/server/notionSource";
import { isoToEpoch, parseJson, truncate } from "@/features/tools/server/sourceUtils";

const FENCE = /^\s*(```|~~~)/;
// A tag, opening, closing, or self-closing. A letter must follow `<`, so "a < b" stays text.
const TAG = /<\/?[a-z][\w-]*(?:\s[^<>]*)?\/?>/gi;
// Block attributes Notion appends to a line, e.g. `{color="gray_bg"}` or `{toggle="true"}`.
const ATTRIBUTES = /\s*\{[a-z_-]+="[^"]*"(?:\s+[a-z_-]+="[^"]*")*\}\s*$/i;

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const cellText = (html: string) => html.replace(/<br\s*\/?>/gi, " ").replace(TAG, "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** An HTML table (Notion's tables, simple and database-like) as a pipe table. */
function tableToPipe(html: string): Array<string> {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cellText(cell[1])));
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 0) return [];
  const line = (cells: Array<string>) => `| ${Array.from({ length: width }, (_, i) => cells[i] || " ").join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)];
}

/** Inline elements: links to pages and people, dates, images, then any other tag dropped for its text. */
function inline(line: string): string {
  return line
    .replace(/<(page|database|mention-page|mention-database)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_, _tag, attrs: string, text: string) => {
      const url = attr(attrs, "url");
      return url === undefined ? text : `[${text || "page"}](${url})`;
    })
    .replace(/<mention-user\b[^>]*>([\s\S]*?)<\/mention-user>/gi, "@$1")
    .replace(/<mention-date\b([^>]*)\/>/gi, (_, attrs: string) => [attr(attrs, "start"), attr(attrs, "end")].filter(Boolean).join(" – "))
    .replace(/<image\b([^>]*)>([\s\S]*?)<\/image>/gi, (_, attrs: string, caption: string) => {
      const src = attr(attrs, "source") ?? attr(attrs, "src");
      return src === undefined ? caption : `![${caption}](${src})`;
    })
    .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(TAG, "");
}

/**
 * ### fromNotionMarkdown
 *
 * Notion's "enhanced Markdown" mixes in XML-like blocks (callouts, toggles,
 * columns, HTML tables, page and people mentions), which a Markdown viewer
 * skips whole, taking their text with them. This rewrites them as plain
 * Markdown: callouts as quotes, toggles as a bold summary over their body,
 * tables as pipe tables, mentions as links or names. Fenced code is kept.
 *
 * @returns Markdown a GFM viewer shows in full.
 */
export function fromNotionMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: Array<string> = [];
  let fenced = false;
  let quoted = 0;
  const push = (line: string) => out.push(quoted > 0 && line.trim() !== "" ? `${"> ".repeat(quoted)}${line}` : quoted > 0 ? ">".repeat(quoted) : line);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced || FENCE.test(line)) {
      push(line);
      continue;
    }
    const trimmed = line.trim();
    if (/^<table\b/i.test(trimmed)) {
      let end = i;
      while (end < lines.length - 1 && !/<\/table>/i.test(lines[end])) end++;
      tableToPipe(lines.slice(i, end + 1).join("\n")).forEach(push);
      i = end;
      continue;
    }
    if (/^<callout\b[^>]*>/i.test(trimmed)) {
      const rest = trimmed.replace(/^<callout\b[^>]*>/i, "");
      quoted++;
      if (rest.trim() !== "") push(inline(rest.replace(/<\/callout>\s*$/i, "")));
      if (/<\/callout>\s*$/i.test(rest)) quoted--;
      continue;
    }
    if (/^<\/callout>$/i.test(trimmed)) {
      quoted = Math.max(0, quoted - 1);
      continue;
    }
    const summary = /^<summary>([\s\S]*?)<\/summary>$/i.exec(trimmed);
    if (summary !== null) {
      push(`**${inline(summary[1].replace(ATTRIBUTES, "")).trim()}**`);
      continue;
    }
    const item = /^(\s*)<li>([\s\S]*?)<\/li>$/i.exec(line);
    if (item !== null) {
      const text = inline(item[2]).trim();
      if (text !== "") push(`${item[1]}- ${text}`);
      continue;
    }
    // Wrappers with nothing of their own to show: toggles, columns, list tags, empty blocks.
    if (/^(<\/?(details|toggle|columns|column|ul|ol|content)\b[^>]*>|<(p|empty-block|unknown)\b[^>]*\/>)$/i.test(trimmed)) {
      if (/^<(p|empty-block)\b/i.test(trimmed)) push("");
      continue;
    }
    push(inline(line.replace(ATTRIBUTES, "")));
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// `API-retrieve-page-markdown` output.
const apiMarkdownSchema = z.object({ markdown: z.string().default(""), truncated: z.boolean().default(false) });
const apiPageSchema = z.object({
  id: z.string(),
  url: z.string().optional(),
  last_edited_time: z.string().optional(),
  properties: apiPropertiesSchema,
});

// `notion-fetch` output from the claude.ai connector; the page is inside `<content>` in `text`.
const connectorFetchSchema = z.object({
  metadata: z.object({ type: z.string() }).optional(),
  title: z.string().nullish(),
  url: z.string().nullish(),
  text: z.string().default(""),
  truncated: z.boolean().default(false),
  page_last_edited_at: z.string().nullish(),
});

const NOT_FOUND = /object_not_found|could not find|not found/i;

/**
 * ### fetchNotionPage
 *
 * @param pageId - Notion page id.
 * @returns The page with its body as Markdown.
 * @throws ToolNotFoundError When there is no such page, or it is not shared
 *   with your integration.
 * @throws Error When the call fails or the output is not the expected JSON.
 */
export async function fetchNotionPage(caller: ToolCaller, pageId: string): Promise<NotionPage> {
  if (viaConnector(caller)) {
    const text = await notFoundOn(caller.callText("notion-fetch", { id: pageId }), NOT_FOUND);
    const parsed = connectorFetchSchema.safeParse(parseJson(text));
    if (!parsed.success) throw new Error(`Could not parse the Notion response: ${truncate(text, 200)}`);
    const page = parsed.data;
    if (page.metadata !== undefined && page.metadata.type !== "page") throw new Error(`This is a Notion ${page.metadata.type}, not a page; open it in Notion.`);
    const content = /<content>([\s\S]*)<\/content>/.exec(page.text)?.[1] ?? page.text;
    return {
      id: pageId,
      title: page.title || "(untitled)",
      markdown: fromNotionMarkdown(content),
      url: page.url ?? notionUrl(pageId),
      updatedAt: isoToEpoch(page.page_last_edited_at),
      truncated: page.truncated,
    };
  }
  const [pageText, markdownText] = await Promise.all([
    caller.callText("API-retrieve-a-page", { page_id: pageId }),
    caller.callText("API-retrieve-page-markdown", { page_id: pageId }),
  ]);
  const page = apiPageSchema.safeParse(parseNotionApi(pageText));
  const body = apiMarkdownSchema.safeParse(parseNotionApi(markdownText));
  if (!page.success) throw new Error(`Could not parse the Notion page: ${truncate(pageText, 200)}`);
  if (!body.success) throw new Error(`Could not parse the Notion page body: ${truncate(markdownText, 200)}`);
  return {
    id: page.data.id,
    title: apiPageTitle(page.data) || "(untitled)",
    markdown: fromNotionMarkdown(body.data.markdown),
    url: page.data.url ?? notionUrl(pageId),
    updatedAt: isoToEpoch(page.data.last_edited_time),
    truncated: body.data.truncated,
  };
}
