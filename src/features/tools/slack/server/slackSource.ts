import { z } from "zod";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { findWidget, type ToolSource, type ToolWidget } from "@/features/tools/server/ToolSource";
import { makeItem, parseJson, truncate, tsToEpoch } from "@/features/tools/server/sourceUtils";
import { cleanSlackText, parseSlackTime, senderName } from "@/features/tools/slack/server/slackFormat";

const SEARCH_TOOL = "slack_search_public_and_private";
const USER_ID_IN_DESCRIPTION = /user_id is (U[A-Z0-9]+)/;

const responseSchema = z.object({ results: z.string() });

/**
 * ### SlackMessage
 *
 * One search hit parsed from the Slack MCP server's Markdown output.
 */
export type SlackMessage = {
  channel: string;
  /** Display name of the sender. */
  from: string;
  fromId: string | undefined;
  at: number | undefined;
  permalink: string | undefined;
  text: string;
};

function line(block: string, label: string): string | undefined {
  return new RegExp(`^${label}: (.*)$`, "m").exec(block)?.[1]?.trim();
}

/**
 * ### parseSlackSearch
 *
 * Parses `slack_search_public_and_private` output in its default `detailed`
 * format, where each hit is a `### Result n of m` block of labelled lines.
 *
 * @returns Messages in the order Slack returned them.
 * @throws Error When the output is not the expected JSON envelope.
 */
export function parseSlackSearch(text: string): Array<SlackMessage> {
  const parsed = responseSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Slack response: ${truncate(text, 200)}`);
  return parsed.data.results
    .split(/^### Result \d+ of \d+$/m)
    .slice(1)
    .map((block): SlackMessage => {
      const fromLine = line(block, "From") ?? "";
      const textStart = block.search(/^Text:/m);
      const afterLabel = textStart === -1 ? "" : block.slice(textStart + "Text:".length);
      const separator = afterLabel.search(/^---$/m);
      const body = separator === -1 ? afterLabel : afterLabel.slice(0, separator);
      const channelLine = line(block, "Channel") ?? "";
      return {
        channel: channelLine.replace(/\s*\(ID: \w+\)\s*$/, ""),
        from: senderName(fromLine),
        fromId: /\(ID: (\w+)\)/.exec(fromLine)?.[1],
        // The message ts is exact; the display time is only a fallback (it parses for a few zones only).
        at: tsToEpoch(line(block, "Message_ts")) ?? parseSlackTime(line(block, "Time")),
        permalink: /^Permalink: \[[^\]]*\]\(([^)]+)\)/m.exec(block)?.[1],
        text: cleanSlackText(body),
      };
    });
}

function toItem(message: SlackMessage, kind: "mention" | "dm" | "search", index: number): DashboardItem {
  const where = message.channel.startsWith("DM") ? "DM" : message.channel;
  return makeItem({
    id: message.permalink ?? `${kind}-${index}`,
    title: truncate(message.text || "(empty)", 160),
    subtitle: `${message.from} · ${where}`,
    at: message.at,
    url: message.permalink,
    badge: kind === "mention" ? { label: "Mention", tone: "info" } : kind === "dm" ? { label: "DM", tone: "neutral" } : undefined,
    delegatePrompt: [
      `Help me respond to a Slack message. From: ${message.from}, in: ${where}${message.permalink === undefined ? "" : `, link: ${message.permalink}`}`,
      "",
      `Message: ${message.text}`,
      "",
      "Read the full thread and related context with the slack MCP and draft a reply. Do not send it until I have reviewed it.",
    ].join("\n"),
  });
}

const userIds = new Map<string, string>();

async function resolveUserId(caller: ToolCaller, configured: string | undefined): Promise<string> {
  if (configured !== undefined) return configured;
  const cached = userIds.get(caller.label);
  if (cached !== undefined) return cached;
  const description = await caller.describe(SEARCH_TOOL);
  const found = description === undefined ? undefined : USER_ID_IN_DESCRIPTION.exec(description)?.[1];
  if (found === undefined) {
    throw new Error("Could not determine your Slack user ID. Set userId on the slack widget in dashboard.yaml.");
  }
  userIds.set(caller.label, found);
  return found;
}

/**
 * ### fetchSlackInbox
 *
 * Recent messages that mention you plus recent DMs sent to you, newest first.
 * Slack search cannot tell read from unread, so this is time-based.
 *
 * @returns At most `limit` items.
 */
export async function fetchSlackInbox(
  caller: ToolCaller,
  options: { lookbackHours: number; limit: number; userId: string | undefined },
  now: number,
): Promise<Array<DashboardItem>> {
  const me = await resolveUserId(caller, options.userId);
  const after = String(Math.floor((now - options.lookbackHours * 3_600_000) / 1000));
  const common = { after, limit: options.limit, sort: "timestamp", include_context: false, natural_language_query: "" };
  const [mentions, dms] = await Promise.all([
    caller.callText(SEARCH_TOOL, { ...common, keywords: [`<@${me}>`] }).then(parseSlackSearch),
    caller.callText(SEARCH_TOOL, { ...common, filters: "is:dm" }).then(parseSlackSearch),
  ]);

  const seen = new Set<string>();
  return [
    ...mentions.map((m, i) => toItem(m, "mention", i)),
    ...dms.filter((m) => m.fromId !== me).map((m, i) => toItem(m, "dm", i)),
  ]
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, options.limit);
}

/**
 * ### searchSlack
 *
 * @returns Messages containing every word of `query`, most relevant first.
 */
export async function searchSlack(caller: ToolCaller, query: string): Promise<Array<DashboardItem>> {
  const keywords = query.split(/\s+/).filter((word) => word !== "");
  const text = await caller.callText(SEARCH_TOOL, {
    keywords,
    natural_language_query: query,
    limit: 10,
    include_context: false,
  });
  return parseSlackSearch(text).map((m, i) => toItem(m, "search", i));
}

/**
 * ### slackToolSource
 *
 * Recent mentions and DMs for the widget; keyword search across messages.
 */
export const slackToolSource: ToolSource<Extract<ToolWidget, { type: "slack" }>> = {
  note: "Slack search can't tell read from unread, so this shows recent messages",
  load: (caller, widget, { now }) => fetchSlackInbox(caller, { lookbackHours: widget.lookbackHours, limit: widget.limit, userId: widget.userId }, now),
  search: (caller, _widget, query) => searchSlack(caller, query),
};

/**
 * ### slackUserId
 *
 * Your Slack member id from the slack widget, so mentions of you can be told apart.
 *
 * @returns `undefined` when there is no slack widget or it does not set `userId`.
 */
export function slackUserId(config: DashboardConfig): string | undefined {
  return findWidget(config, "slack")?.userId;
}
