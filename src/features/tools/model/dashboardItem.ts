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
    meetingUrl: undefined,
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

/**
 * ### slackMessagePrompt
 *
 * What a session is asked when you hand it a Slack message, from the
 * sidebar or the message's tab: a reply draft, never sent before you review it.
 *
 * @param message - `where` is the channel (or `DM`) when known; `url` its permalink.
 */
export function slackMessagePrompt(message: { from: string; where?: string; url?: string; text: string }): string {
  const where = message.where === undefined ? "" : `, in: ${message.where}`;
  const link = message.url === undefined ? "" : `, link: ${message.url}`;
  return [
    `Help me respond to a Slack message. From: ${message.from}${where}${link}`,
    "",
    `Message: ${message.text}`,
    "",
    "Read the full thread and related context with the slack MCP and draft a reply. Do not send it until I have reviewed it.",
  ].join("\n");
}

/** How much of an event's description goes into its prompt. */
const EVENT_DESCRIPTION_CHARS = 1500;

/**
 * ### eventPrompt
 *
 * What a session is asked when you hand it a calendar event, from the
 * sidebar or the event's tab: a briefing before the meeting.
 *
 * @param event - `when` as the caller shows it, e.g. `2026-11-25 10:00–11:00`.
 */
export function eventPrompt(event: { title: string; when: string; location?: string; guests?: Array<string>; description?: string }): string {
  return [
    `Help me prepare for this event: "${event.title || "(untitled)"}" (${event.when})`,
    event.location === undefined ? "" : `Location: ${event.location}`,
    event.guests === undefined || event.guests.length === 0 ? "" : `Guests: ${event.guests.join(", ")}`,
    event.description === undefined || event.description === "" ? "" : `Description:\n${event.description.slice(0, EVENT_DESCRIPTION_CHARS)}`,
    "",
    "Find related Linear issues, Nuclino docs, and Slack conversations, and summarize what I should know before the meeting.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
