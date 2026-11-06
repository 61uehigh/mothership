import { z } from "zod";
import type { DashboardItem, ItemTone } from "@/features/tools/model/Dashboard";
import type { LinearNotification } from "@/features/tools/model/Tools";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { ToolSource, ToolWidget } from "@/features/tools/server/ToolSource";
import { makeItem, linearIssuePrompt } from "@/features/tools/model/dashboardItem";
import { isoToEpoch, parseJson, truncate, zonedDate } from "@/features/tools/server/sourceUtils";
import {
  canQueryLinearDirectly,
  fetchSubscribedIssuePage,
  type LinearSubscribedPage,
} from "@/features/tools/linear/server/linearApi";

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

/**
 * ### LinearIssueRow
 *
 * One issue as the widget needs it, whether it came from MCP or GraphQL.
 */
export type LinearIssueRow = z.infer<typeof issueSchema>;

// Rows per request, and the most pages followed, so a runaway cursor cannot
// loop forever.
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

// Linear status types that mean the issue is finished.
const CLOSED_STATUS_TYPES = new Set(["completed", "canceled", "duplicate"]);

const PRIORITY_TONE: Record<number, ItemTone> = { 1: "danger", 2: "warning" };

/**
 * ### linearIssueItem
 *
 * @param today - `YYYY-MM-DD`, for flagging overdue issues.
 */
export function linearIssueItem(issue: LinearIssueRow, today: string): DashboardItem {
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
    due: issue.dueDate ?? undefined,
    priority,
    delegatePrompt: linearIssuePrompt(issue),
  });
}

/**
 * ### parseLinearIssues
 *
 * @param text - Raw `list_issues` output.
 * @returns Issues in the order Linear returned them.
 * @throws Error When the output is not the expected JSON.
 */
function parseLinearIssues(text: string): Array<LinearIssueRow> {
  const parsed = responseSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Linear response: ${truncate(text, 200)}`);
  return parsed.data.issues;
}

/**
 * ### sortLinearIssues
 *
 * Open issues only: urgent and overdue first, then by status type in the
 * order of `states`, then most recently updated.
 *
 * @param states - Linear status types in display order; others go last.
 */
export function sortLinearIssues(issues: Array<LinearIssueRow>, states: Array<string>, today: string): Array<DashboardItem> {
  const seen = new Set<string>();
  const rank = (issue: LinearIssueRow) => {
    const index = states.indexOf(issue.statusType ?? "");
    return index === -1 ? states.length : index;
  };
  return issues
    .filter((issue) => !CLOSED_STATUS_TYPES.has(issue.statusType ?? "") && !seen.has(issue.id) && seen.add(issue.id))
    .map((issue) => ({ issue, item: linearIssueItem(issue, today) }))
    .sort(
      (a, b) =>
        Number(b.item.highlighted) - Number(a.item.highlighted) ||
        rank(a.issue) - rank(b.issue) ||
        (b.item.at ?? 0) - (a.item.at ?? 0),
    )
    .map(({ item }) => item);
}

/**
 * ### SubscribedPageFetcher
 *
 * Reads one page of subscribed issues; {@link fetchSubscribedIssuePage} in
 * the app, a fake in tests.
 */
export type SubscribedPageFetcher = (options: { stateTypes: Array<string>; first: number; after: string | undefined }) => Promise<LinearSubscribedPage>;

/**
 * ### fetchSubscribedLinearIssues
 *
 * Every open issue you are subscribed to in Linear, following every page, in
 * {@link sortLinearIssues} order.
 *
 * @param options.states - Linear status types to ask for, in display order.
 * @param options.limit - Cut the list to this many; `undefined` keeps all.
 */
export async function fetchSubscribedLinearIssues(
  fetchPage: SubscribedPageFetcher,
  options: { states: Array<string>; limit: number | undefined; today: string },
): Promise<Array<DashboardItem>> {
  const issues: Array<LinearIssueRow> = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage({ stateTypes: options.states, first: PAGE_SIZE, after });
    for (const node of result.nodes) {
      issues.push({
        id: node.identifier,
        title: node.title,
        url: node.url,
        status: node.state.name,
        statusType: node.state.type,
        priority: { value: node.priority, name: node.priorityLabel },
        updatedAt: node.updatedAt,
        dueDate: node.dueDate,
        team: node.team?.name,
      });
    }
    after = result.pageInfo.hasNextPage ? (result.pageInfo.endCursor ?? undefined) : undefined;
    if (after === undefined) break;
  }
  const items = sortLinearIssues(issues, options.states, options.today);
  return options.limit === undefined ? items : items.slice(0, options.limit);
}

/**
 * ### fetchAssignedLinearIssues
 *
 * Fallback when GraphQL is not available (no `LINEAR_API_KEY`, or demo mode):
 * the Linear MCP server cannot filter by subscriber, so this lists open
 * issues assigned to you instead, in {@link sortLinearIssues} order.
 */
export async function fetchAssignedLinearIssues(
  caller: ToolCaller,
  options: { states: Array<string>; limit: number | undefined; today: string },
): Promise<Array<DashboardItem>> {
  const groups = await Promise.all(
    options.states.map(async (state) =>
      parseLinearIssues(await caller.callText("list_issues", { assignee: "me", state, limit: 250, orderBy: "updatedAt", fields: FIELDS })),
    ),
  );
  const items = sortLinearIssues(groups.flat(), options.states, options.today);
  return options.limit === undefined ? items : items.slice(0, options.limit);
}

/**
 * ### searchLinear
 *
 * @returns Issues whose title or description matches, finished ones included.
 */
export async function searchLinear(
  caller: ToolCaller,
  query: string,
  today: string,
): Promise<Array<DashboardItem>> {
  const text = await caller.callText("list_issues", { query, limit: 10, fields: FIELDS });
  return parseLinearIssues(text).map((issue) => linearIssueItem(issue, today));
}

const notificationsSchema = z.object({
  notifications: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string().nullish(),
      subtitle: z.string().nullish(),
      url: z.string().nullish(),
      createdAt: z.string(),
      readAt: z.string().nullish(),
      archivedAt: z.string().nullish(),
      snoozedUntilAt: z.string().nullish(),
    }),
  ),
});

const ISSUE_IN_URL = /\/issue\/([A-Z][A-Z0-9]*-\d+)/;

/**
 * ### parseLinearNotifications
 *
 * Reads `get_notifications` output. Archived notifications and ones snoozed
 * past `now` are left out, like in Linear's inbox.
 *
 * @throws Error When the output is not the expected JSON.
 */
export function parseLinearNotifications(text: string, now: number): Array<LinearNotification> {
  const parsed = notificationsSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse Linear notifications: ${truncate(text, 200)}`);
  return parsed.data.notifications.flatMap((n): Array<LinearNotification> => {
    const at = isoToEpoch(n.createdAt);
    const snoozed = (isoToEpoch(n.snoozedUntilAt) ?? 0) > now;
    const url = n.url ?? undefined;
    if (at === undefined || (n.archivedAt ?? undefined) !== undefined || snoozed || url === undefined) return [];
    return [
      {
        id: n.id,
        type: n.type,
        title: n.title ?? "(untitled)",
        subtitle: n.subtitle ?? "",
        issueId: ISSUE_IN_URL.exec(url)?.[1],
        url,
        at,
        read: (n.readAt ?? undefined) !== undefined,
      },
    ];
  });
}

/**
 * ### fetchLinearNotifications
 *
 * Your latest Linear notifications, newest first, in one call. The Inbox
 * caches them like issue details.
 */
export async function fetchLinearNotifications(caller: ToolCaller, now: number): Promise<Array<LinearNotification>> {
  return parseLinearNotifications(await caller.callText("get_notifications", { limit: 50 }), now);
}

/**
 * ### linearToolSource
 *
 * Every open issue you are subscribed to for the widget (assigned to you when
 * only MCP is available); title and description search.
 */
export const linearToolSource: ToolSource<Extract<ToolWidget, { type: "linear" }>> = {
  load: (caller, widget, { now, timeZone }) => {
    const options = { states: widget.states, limit: widget.limit, today: zonedDate(now, timeZone) };
    return canQueryLinearDirectly() ? fetchSubscribedLinearIssues(fetchSubscribedIssuePage, options) : fetchAssignedLinearIssues(caller, options);
  },
  search: (caller, _widget, query, { now, timeZone }) => searchLinear(caller, query, zonedDate(now, timeZone)),
};
