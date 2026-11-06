import { z } from "zod";
import type { NuclinoDoc } from "@/features/tools/model/Tools";
import { notFoundOn, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { nuclinoUrl } from "@/features/tools/nuclino/server/nuclinoSource";
import { isoToEpoch, parseJson, truncate } from "@/features/tools/server/sourceUtils";

// Shape of `get_item` output from Nuclino's MCP server (checked against a real call;
// it also returns `type`, `workspaceId`, `createdAt`, and `contentVersion`).
const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullish(),
  lastUpdatedAt: z.string().nullish(),
});

const GRID_BORDER = /^\s*\+([-=:]+\+)+\s*$/;
const GRID_ROW = /^\s*\|.*\|\s*$/;

function cellsOf(line: string): Array<string> {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function pipeRow(cells: Array<string>): string {
  // `<br>` is HTML, which the viewer skips; a space keeps the words apart.
  return `| ${cells.map((c) => c.replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim() || " ").join(" | ")} |`;
}

/**
 * Converts one grid table (`+---+` borders, `|` rows, cells may span lines)
 * to a GFM pipe table. Pipe tables need a header, so a table without a `+===+`
 * header border uses its first row.
 *
 * @returns The pipe table lines, or `undefined` when rows have uneven cells.
 */
function gridToPipe(block: Array<string>): Array<string> | undefined {
  const rows: Array<Array<string>> = [];
  let headerRows = 0;
  let current: Array<string> | undefined;
  for (const line of block) {
    if (GRID_BORDER.test(line)) {
      if (current !== undefined) rows.push(current);
      current = undefined;
      if (line.includes("=")) headerRows = rows.length;
      continue;
    }
    const cells = cellsOf(line);
    if (current === undefined) current = cells;
    else if (current.length === cells.length) current = current.map((c, i) => `${c} ${cells[i]}`.trim());
    else return undefined;
  }
  if (current !== undefined) rows.push(current);
  const width = rows[0]?.length ?? 0;
  if (width === 0 || rows.some((r) => r.length !== width)) return undefined;
  const header = headerRows > 0 ? rows.slice(0, headerRows).reduce((a, b) => a.map((c, i) => `${c} ${b[i]}`)) : rows[0];
  const body = rows.slice(Math.max(headerRows, 1));
  return [pipeRow(header), `|${" --- |".repeat(width)}`, ...body.map(pipeRow)];
}

/**
 * ### toGfm
 *
 * Nuclino exports tables as Pandoc grid tables, which GFM renderers show as
 * plain text; this rewrites them as pipe tables and leaves everything else,
 * including fenced code, as is.
 *
 * @returns Markdown with grid tables converted.
 */
export function toGfm(markdown: string): string {
  const lines = markdown.split("\n");
  const out: Array<string> = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced || !GRID_BORDER.test(line)) {
      out.push(line);
      continue;
    }
    let end = i + 1;
    while (end < lines.length && (GRID_BORDER.test(lines[end]) || GRID_ROW.test(lines[end]))) end++;
    const block = lines.slice(i, end);
    const table = gridToPipe(block);
    // Keep a table we can't convert legible as preformatted text.
    out.push(...(table ?? ["```", ...block, "```"]));
    i = end - 1;
  }
  return out.join("\n");
}

/**
 * ### fetchNuclinoDoc
 *
 * @param itemId - Nuclino item UUID.
 * @returns The doc with its Markdown body.
 * @throws Error When the call fails or the output is not the expected JSON.
 */
export async function fetchNuclinoDoc(caller: ToolCaller, itemId: string): Promise<NuclinoDoc> {
  const text = await notFoundOn(caller.callText("get_item", { itemId }), /item not found/i);
  const parsed = itemSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Nuclino response: ${truncate(text, 200)}`);
  const item = parsed.data;
  return {
    id: item.id,
    title: item.title || "(untitled)",
    markdown: toGfm(item.content ?? ""),
    url: nuclinoUrl(item.id),
    updatedAt: isoToEpoch(item.lastUpdatedAt),
  };
}
