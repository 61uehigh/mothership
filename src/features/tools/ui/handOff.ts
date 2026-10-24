import type { CalendarEventDetail, LinearIssue, NuclinoDoc, SlackThread } from "@/features/tools/model/Tools";
import type { DashboardItem } from "@/features/tools/model/Dashboard";

function item(fields: Pick<DashboardItem, "id" | "title" | "url" | "delegatePrompt">): DashboardItem {
  return {
    subtitle: undefined,
    meta: undefined,
    at: undefined,
    secondaryLink: undefined,
    badge: undefined,
    highlighted: false,
    muted: false,
    ...fields,
  };
}

/**
 * ### nuclinoHandOffItem
 *
 * @returns A dashboard item for `draftFor("nuclino", …)`, with the same
 *   prompt the Nuclino widget gives its rows.
 */
export function nuclinoHandOffItem(doc: NuclinoDoc): DashboardItem {
  return item({
    id: doc.id,
    title: doc.title,
    url: doc.url,
    delegatePrompt: [
      `Read the Nuclino doc "${doc.title}" (id: ${doc.id}) with the nuclino MCP and summarize the key points.`,
      "If there are follow-up tasks or related Linear issues, list those too.",
    ].join("\n"),
  });
}

/**
 * ### linearHandOffItem
 *
 * @returns A dashboard item for `draftFor("linear", …)`, with the same
 *   prompt the Linear widget gives its rows.
 */
export function linearHandOffItem(issue: LinearIssue): DashboardItem {
  return item({
    id: issue.id,
    title: issue.title,
    url: issue.url,
    delegatePrompt: [
      `Work on Linear issue ${issue.id} "${issue.title}".${issue.url === undefined ? "" : ` (${issue.url})`}`,
      "First read the issue description and comments with the linear MCP, list what needs to be done and anything that needs clarifying, then proceed.",
    ].join("\n"),
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
  return item({
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
  return item({
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
