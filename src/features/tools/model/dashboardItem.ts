import type { DashboardItem } from "@/features/tools/model/Dashboard";

/**
 * ### makeItem
 *
 * Builds a {@link DashboardItem} with every optional field defaulted, so
 * sources only spell out what they know.
 *
 * @returns A complete item.
 */
export function makeItem(
  fields: Pick<DashboardItem, "id" | "title" | "delegatePrompt"> & Partial<DashboardItem>,
): DashboardItem {
  return {
    subtitle: undefined,
    meta: undefined,
    at: undefined,
    url: undefined,
    secondaryLink: undefined,
    badge: undefined,
    highlighted: false,
    muted: false,
    due: undefined,
    priority: undefined,
    slack: undefined,
    event: undefined,
    ...fields,
  };
}

/**
 * ### nuclinoDocPrompt
 *
 * What a session is asked when you hand it a Nuclino doc, from the sidebar or the doc's tab.
 */
export function nuclinoDocPrompt(doc: { id: string; title: string }): string {
  return [
    `Read the Nuclino doc "${doc.title}" (id: ${doc.id}) with the nuclino MCP and summarize the key points.`,
    "If there are follow-up tasks or related Linear issues, list those too.",
  ].join("\n");
}

/**
 * ### notionPagePrompt
 *
 * What a session is asked when you hand it a Notion page, from the sidebar or the page's tab.
 */
export function notionPagePrompt(page: { id: string; title: string }): string {
  return [`Read the Notion page "${page.title}" (id: ${page.id}) with the notion MCP and summarize the key points.`, "If there are follow-up tasks, list those too."].join("\n");
}

/**
 * ### linearIssuePrompt
 *
 * What a session is asked when you hand it a Linear issue, from the sidebar or the issue's tab.
 */
export function linearIssuePrompt(issue: { id: string; title: string; url?: string }): string {
  return [
    `Work on Linear issue ${issue.id} "${issue.title}".${issue.url === undefined ? "" : ` (${issue.url})`}`,
    "First read the issue description and comments with the linear MCP, list what needs to be done and anything that needs clarifying, then proceed.",
  ].join("\n");
}
