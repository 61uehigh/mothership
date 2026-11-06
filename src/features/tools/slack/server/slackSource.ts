import { z } from "zod";
import type { DashboardItem, SlackReason } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { findWidget, type ToolSource, type ToolWidget } from "@/features/tools/server/ToolSource";
import { makeItem } from "@/features/tools/model/dashboardItem";
import { parseJson, truncate, tsToEpoch } from "@/features/tools/server/sourceUtils";
import { cleanSlackText, parseSlackTime, senderName } from "@/features/tools/slack/server/slackFormat";
import { processState } from "@/platform/processState";

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
  /** The message has `@here`, `@channel`, or `@everyone`, which notify everyone in the channel. */
  broadcast: boolean;
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
        broadcast: /<!(?:here|channel|everyone)\b/.test(body),
      };
    });
}

/** Where a message was posted, as shown: `#channel`, or `DM` for a direct or group DM. */
function placeOf(message: SlackMessage): string {
  return message.channel.startsWith("DM") ? "DM" : message.channel;
}

const BADGES: Record<SlackReason, DashboardItem["badge"]> = {
  dm: { label: "DM", tone: "neutral" },
  mention: { label: "Mention", tone: "info" },
  group: { label: "@here", tone: "neutral" },
};

function toItem(message: SlackMessage, reason: SlackReason | undefined, index: number): DashboardItem {
  const where = placeOf(message);
  return makeItem({
    id: message.permalink ?? `${reason ?? "search"}-${index}`,
    title: truncate(message.text || "(empty)", 160),
    subtitle: `${message.from} · ${where}`,
    at: message.at,
    url: message.permalink,
    badge: reason === undefined ? undefined : BADGES[reason],
    slack: reason === undefined ? undefined : { reason, channel: where },
    delegatePrompt: [
      `Help me respond to a Slack message. From: ${message.from}, in: ${where}${message.permalink === undefined ? "" : `, link: ${message.permalink}`}`,
      "",
      `Message: ${message.text}`,
      "",
      "Read the full thread and related context with the slack MCP and draft a reply. Do not send it until I have reviewed it.",
    ].join("\n"),
  });
}

/**
 * ### mergeSlackInbox
 *
 * Merges the three searches into one list, newest first. Your own messages
 * are dropped. A message found by more than one search counts once, with
 * the most direct reason: anything in a DM is a `dm`, then a `mention` of
 * you, then a `group` mention (`@here` / `@channel`) outside DMs.
 *
 * @param me - Your Slack member id.
 */
export function mergeSlackInbox(found: { mentions: Array<SlackMessage>; dms: Array<SlackMessage>; groups: Array<SlackMessage> }, me: string): Array<DashboardItem> {
  const tagged: Array<[SlackMessage, SlackReason]> = [
    ...found.dms.map((m): [SlackMessage, SlackReason] => [m, "dm"]),
    ...found.mentions.map((m): [SlackMessage, SlackReason] => [m, placeOf(m) === "DM" ? "dm" : "mention"]),
    // Search is lexical and loose ("at here" matches too), so keep real broadcasts only.
    ...found.groups.filter((m) => m.broadcast && placeOf(m) !== "DM").map((m): [SlackMessage, SlackReason] => [m, "group"]),
  ];
  const seen = new Set<string>();
  return tagged
    .filter(([m]) => m.fromId !== me)
    .map(([m, reason], i) => toItem(m, reason, i))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

const userIds = processState("slack.userIds", () => new Map<string, string>());

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
 * Recent messages that mention you, recent DMs sent to you, and, with
 * `groupMentions`, recent `@here` / `@channel` in channels you are in;
 * newest first. Each search returns at most `limit` messages, so a busy DM
 * list cannot push mentions out. Slack search cannot tell read from unread,
 * so this is time-based.
 *
 * Every search is one call (through the claude.ai relay, a little Claude
 * usage each), and Slack search has no OR across keywords, so mentions and
 * DMs take two calls and `groupMentions` two more; the dashboard caches the
 * result for the widget's `refreshSeconds`.
 */
export async function fetchSlackInbox(
  caller: ToolCaller,
  options: { lookbackHours: number; limit: number; userId: string | undefined; groupMentions: boolean },
  now: number,
): Promise<Array<DashboardItem>> {
  const me = await resolveUserId(caller, options.userId);
  const after = String(Math.floor((now - options.lookbackHours * 3_600_000) / 1000));
  const common = { after, limit: options.limit, sort: "timestamp", include_context: false, natural_language_query: "" };
  const search = (args: Record<string, unknown>) => caller.callText(SEARCH_TOOL, { ...common, ...args }).then(parseSlackSearch);
  // Group mentions are extra: when their search fails, the rest still shows.
  const broadcast = (keyword: string) => search({ keywords: [keyword], only_my_channels: true }).catch((): Array<SlackMessage> => []);
  const [mentions, dms, here, channel] = await Promise.all([
    search({ keywords: [`<@${me}>`] }),
    search({ filters: "is:dm" }),
    options.groupMentions ? broadcast("<!here>") : [],
    options.groupMentions ? broadcast("<!channel>") : [],
  ]);
  return mergeSlackInbox({ mentions, dms, groups: [...here, ...channel] }, me);
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
  return parseSlackSearch(text).map((m, i) => toItem(m, undefined, i));
}

/**
 * ### slackToolSource
 *
 * Recent mentions and DMs (and `@here` / `@channel` when asked) for the
 * widget; keyword search across messages.
 */
export const slackToolSource: ToolSource<Extract<ToolWidget, { type: "slack" }>> = {
  note: "Slack search can't tell read from unread, so this shows recent messages",
  load: (caller, widget, { now }) =>
    fetchSlackInbox(caller, { lookbackHours: widget.lookbackHours, limit: widget.limit, userId: widget.userId, groupMentions: widget.groupMentions }, now),
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
