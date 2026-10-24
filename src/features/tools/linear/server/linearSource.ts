import { z } from "zod";
import type { DashboardItem, ItemTone } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { ToolSource, ToolWidget } from "@/features/tools/server/ToolSource";
import { isoToEpoch, makeItem, parseJson, truncate, zonedDate } from "@/features/tools/server/sourceUtils";

const FIELDS = ["id", "title", "url", "status", "statusType", "priority", "updatedAt", "dueDate", "team"];

// Shape of `list_issues` output from Linear's MCP server when `fields` is passed.
const issueSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  status: z.string().nullish(),
  statusType: z.string().nullish(),
  priority: z.object({ value: z.number(), name: z.string() }).nullish(),
  updatedAt: z.string().nullish(),
  dueDate: z.string().nullish(),
  team: z.string().nullish(),
});
const responseSchema = z.object({ issues: z.array(issueSchema) });

const PRIORITY_TONE: Record<number, ItemTone> = { 1: "danger", 2: "warning" };

/**
 * ### parseLinearIssues
 *
 * @param text - Raw `list_issues` output.
 * @param today - `YYYY-MM-DD`, for flagging overdue issues.
 * @returns Items in the order Linear returned them.
 * @throws Error When the output is not the expected JSON.
 */
function parseLinearIssues(text: string, today: string): Array<DashboardItem> {
  const parsed = responseSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Linear response: ${truncate(text, 200)}`);
  return parsed.data.issues.map((issue) => {
    const overdue = issue.dueDate !== null && issue.dueDate !== undefined && issue.dueDate < today;
    const priority = issue.priority?.value ?? 0;
    return makeItem({
      id: issue.id,
      title: issue.title,
      subtitle: [issue.team, issue.status].filter(Boolean).join(" · ") || undefined,
      meta: issue.id,
      at: isoToEpoch(issue.updatedAt),
      url: issue.url,
      badge: overdue
        ? { label: "Overdue", tone: "danger" }
        : PRIORITY_TONE[priority] !== undefined && issue.priority !== null && issue.priority !== undefined
          ? { label: issue.priority.name, tone: PRIORITY_TONE[priority] }
          : undefined,
      highlighted: priority === 1 || overdue,
      delegatePrompt: [
        `Work on Linear issue ${issue.id} "${issue.title}".${issue.url === undefined ? "" : ` (${issue.url})`}`,
        "First read the issue description and comments with the linear MCP, list what needs to be done and anything that needs clarifying, then proceed.",
      ].join("\n"),
    });
  });
}

/**
 * ### fetchMyLinearIssues
 *
 * Issues assigned to the token's user, grouped by status type in the order
 * given, then by most recently updated.
 *
 * @returns At most `limit` items.
 */
export async function fetchMyLinearIssues(
  caller: ToolCaller,
  options: { states: Array<string>; limit: number; today: string },
): Promise<Array<DashboardItem>> {
  const groups = await Promise.all(
    options.states.map(async (state) =>
      parseLinearIssues(
        await caller.callText("list_issues", {
          assignee: "me",
          state,
          limit: options.limit,
          orderBy: "updatedAt",
          fields: FIELDS,
        }),
        options.today,
      ),
    ),
  );
  return groups.flat().slice(0, options.limit);
}

/**
 * ### searchLinear
 *
 * @returns Issues whose title or description matches.
 */
export async function searchLinear(
  caller: ToolCaller,
  query: string,
  today: string,
): Promise<Array<DashboardItem>> {
  const text = await caller.callText("list_issues", { query, limit: 10, fields: FIELDS });
  return parseLinearIssues(text, today);
}

/**
 * ### linearToolSource
 *
 * Issues assigned to you for the widget; title and description search.
 */
export const linearToolSource: ToolSource<Extract<ToolWidget, { type: "linear" }>> = {
  load: (caller, widget, { now, timeZone }) => fetchMyLinearIssues(caller, { states: widget.states, limit: widget.limit, today: zonedDate(now, timeZone) }),
  search: (caller, _widget, query, { now, timeZone }) => searchLinear(caller, query, zonedDate(now, timeZone)),
};
