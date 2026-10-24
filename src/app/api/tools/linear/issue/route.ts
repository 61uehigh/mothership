import { z } from "zod";
import { parseQuery, respondWith } from "@/app/api/_lib/http";
import { fetchLinearIssue } from "@/features/tools/linear/server/linearIssue";
import { getDashboard } from "@/composition/server";
import { highlightNames } from "@/features/tools/server/sourceUtils";

const querySchema = z.object({
  id: z.string({ error: "id is required" }).trim().min(1, { error: "id is required" }).max(100),
});

/**
 * ### GET
 *
 * Reads one Linear issue and its comments through the source of the `linear`
 * dashboard widget. `?id=` is an identifier such as `DEV-123`.
 *
 * @returns A `LinearIssue`; 400 for a missing id, 404 when Linear has no such
 *   issue, 409 when Linear is not set up, 502 when a call fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const { id } = query;
  const dashboard = getDashboard();
  const names = await dashboard.myNames();
  const outcome = await dashboard.callTool("linear", async (caller) => {
    const issue = await fetchLinearIssue(caller, id);
    return {
      ...issue,
      markdown: highlightNames(issue.markdown, names),
      comments: issue.comments.map((c) => ({ ...c, body: highlightNames(c.body, names) })),
    };
  });
  return respondWith(outcome, `Linear issue ${id}`);
}
