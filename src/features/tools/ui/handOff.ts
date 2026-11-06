import type { CalendarEventDetail, LinearIssue, NotionPage, NuclinoDoc, SlackThread } from "@/features/tools/model/Tools";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import { linearIssuePrompt, makeItem, notionPagePrompt, nuclinoDocPrompt } from "@/features/tools/model/dashboardItem";

/**
 * ### nuclinoHandOffItem
 *
 * @returns A dashboard item for `draftFor("nuclino", …)`, with the same
 *   prompt the Nuclino widget gives its rows.
 */
export function nuclinoHandOffItem(doc: NuclinoDoc): DashboardItem {
  return makeItem({
    id: doc.id,
    title: doc.title,
    url: doc.url,
    delegatePrompt: nuclinoDocPrompt(doc),
  });
}

/**
 * ### notionHandOffItem
 *
 * @returns A dashboard item for `draftFor("notion", …)`, with the same
 *   prompt the Notion widget gives its rows.
 */
export function notionHandOffItem(page: NotionPage): DashboardItem {
  return makeItem({
    id: page.id,
    title: page.title,
    url: page.url,
    delegatePrompt: notionPagePrompt(page),
  });
}

/**
 * ### linearHandOffItem
 *
 * @returns A dashboard item for `draftFor("linear", …)`, with the same
 *   prompt the Linear widget gives its rows.
 */
export function linearHandOffItem(issue: LinearIssue): DashboardItem {
  return makeItem({
    id: issue.id,
    title: issue.title,
    url: issue.url,
    delegatePrompt: linearIssuePrompt(issue),
  });
}

/**
 * ### slackHandOffItem
 *
 * @returns A dashboard item for `draftFor("slack", …)` that asks for a reply
 *   draft to the opened message, with the thread as context.
 */
export function slackHandOffItem(thread: SlackThread): DashboardItem {
  const focus = thread.messages.find((m) => m.ts === thread.focusTs) ?? thread.messages[0];
  return makeItem({
    id: thread.url,
    title: focus.markdown.slice(0, 80),
    url: thread.url,
    delegatePrompt: [
      `Help me respond to a Slack message from ${focus.from}: ${thread.url}`,
      "",
      `Message: ${focus.markdown}`,
      "",
      "Read the full thread and related context with the slack MCP and draft a reply. Do not send it until I have reviewed it.",
    ].join("\n"),
  });
}

/**
 * ### eventHandOffItem
 *
 * @returns A dashboard item for `draftFor("calendar", …)` that asks for a
 *   briefing before the event.
 */
export function eventHandOffItem(event: CalendarEventDetail, when: string): DashboardItem {
  return makeItem({
    id: event.id,
    title: event.title,
    url: event.url,
    delegatePrompt: [
      `Help me prepare for this event: "${event.title}" (${when})`,
      event.location === undefined ? "" : `Location: ${event.location}`,
      event.attendees.length === 0 ? "" : `Guests: ${event.attendees.map((a) => a.name).join(", ")}`,
      event.markdown === "" ? "" : `Description:\n${event.markdown.slice(0, 1500)}`,
      "",
      "Find related Linear issues, Nuclino docs, and Slack conversations, and summarize what I should know before the meeting.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  });
}
