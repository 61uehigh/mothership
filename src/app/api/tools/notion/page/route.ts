import { z } from "zod";
import { parseQuery, respondWith } from "@/app/api/_lib/http";
import { fetchNotionPage } from "@/features/tools/notion/server/notionPage";
import { getDashboard } from "@/composition/server";
import { highlightNames } from "@/features/tools/server/sourceUtils";

// Notion ids are 32 hex digits in UUID form but not always RFC 4122 UUIDs, so only the form is checked.
const querySchema = z.object({ id: z.guid({ error: "id must be a Notion page id" }) });

/**
 * ### GET
 *
 * Reads one Notion page through the source of the `notion` dashboard widget.
 * `?id=` is the page id.
 *
 * @returns A `NotionPage`; 400 for a bad id, 404 when Notion has no such
 *   page (or it is not shared with your integration), 409 when Notion is not
 *   set up, 502 when the call fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const { id } = query;
  const dashboard = getDashboard();
  const names = await dashboard.myNames();
  const outcome = await dashboard.callTool("notion", async (caller) => {
    const page = await fetchNotionPage(caller, id);
    return { ...page, markdown: highlightNames(page.markdown, names) };
  });
  return respondWith(outcome, `Notion page ${id}`);
}
