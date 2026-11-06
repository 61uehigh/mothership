import { z } from "zod";
import type { DashboardItem, SlackReason } from "@/features/tools/model/Dashboard";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { findWidget, type ToolSource, type ToolWidget } from "@/features/tools/server/ToolSource";
import { makeItem, slackMessagePrompt } from "@/features/tools/model/dashboardItem";
import { parseJson, truncate, tsToEpoch } from "@/features/tools/server/sourceUtils";
import { cleanSlackText, parseSlackTime, senderName, unquoteSlackBody } from "@/features/tools/slack/server/slackFormat";
import { parseSlackPermalink } from "@/features/tools/slack/server/slackThread";
import { processState } from "@/platform/processState";

const SEARCH_TOOL = "slack_search_public_and_private";
const USER_ID_IN_DESCRIPTION = /user_id is (U[A-Z0-9]+)/;

const responseSchema = z.object({ results: z.string(), pagination_info: z.string().optional() });

/**
 * ### SlackSearchHit
 *
 * One search hit parsed from the Slack MCP server's Markdown output.
 */
export type SlackSearchHit = {
  channel: string;
  /** Display name of the sender. */
  from: string;
  fromId: string | undefined;
  at: number | undefined;
  permalink: string | undefined;
  /** Slack's id of the message, e.g. `1790825315.143249`. */
  ts: string | undefined;
  /** Single-line readable text. */
  text: string;
  /** The text as Slack wrote it (mrkdwn, line breaks and indented bullets kept). */
  markup: string;
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
export function parseSlackSearch(text: string): Array<SlackSearchHit> {
  const parsed = responseSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Slack response: ${truncate(text, 200)}`);
  return parsed.data.results
    .split(/^### Result \d+ of \d+$/m)
    .slice(1)
    .map((block): SlackSearchHit => {
      const fromLine = line(block, "From") ?? "";
      const textStart = block.search(/^Text:/m);
      const afterLabel = textStart === -1 ? "" : block.slice(textStart + "Text:".length);
      const separator = afterLabel.search(/^---$/m);
      const body = unquoteSlackBody(separator === -1 ? afterLabel : afterLabel.slice(0, separator));
      const channelLine = line(block, "Channel") ?? "";
      return {
        channel: channelLine.replace(/\s*\(ID: \w+\)\s*$/, ""),
        from: senderName(fromLine),
        fromId: /\(ID: (\w+)\)/.exec(fromLine)?.[1],
        // The message ts is exact; the display time is only a fallback (it parses for a few zones only).
        at: tsToEpoch(line(block, "Message_ts")) ?? parseSlackTime(line(block, "Time")),
        permalink: /^Permalink: \[[^\]]*\]\(([^)]+)\)/m.exec(block)?.[1],
        ts: line(block, "Message_ts"),
        text: cleanSlackText(body),
        markup: body.replace(/^\n+|\s+$/g, ""),
        broadcast: /<!(?:here|channel|everyone)\b/.test(body),
      };
    });
}

/** Where a message was posted, as shown: `#channel`, or `DM` for a direct or group DM. */
function placeOf(message: SlackSearchHit): string {
  return message.channel.startsWith("DM") ? "DM" : message.channel;
}

/** The channel or DM a message is in, plus its thread if any; `undefined` without a readable permalink. */
function conversationOf(permalink: string | undefined): string | undefined {
  const link = permalink === undefined ? undefined : parseSlackPermalink(permalink);
  if (link === undefined) return undefined;
  return link.threadTs === undefined ? link.channelId : `${link.channelId}:${link.threadTs}`;
}

function toItem(message: SlackSearchHit, reason: SlackReason | undefined, index: number): DashboardItem {
  const where = placeOf(message);
  return makeItem({
    id: message.permalink ?? `${reason ?? "search"}-${index}`,
    title: truncate(message.text, 160),
    subtitle: `${message.from} · ${where}`,
    at: message.at,
    url: message.permalink,
    badge: reason,
    slack: reason === undefined ? undefined : { reason, channel: where, conversation: conversationOf(message.permalink), ts: message.ts },
    delegatePrompt: slackMessagePrompt({ from: message.from, where, url: message.permalink, text: message.text }),
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
export function mergeSlackInbox(found: { mentions: Array<SlackSearchHit>; dms: Array<SlackSearchHit>; groups: Array<SlackSearchHit> }, me: string): Array<DashboardItem> {
  const tagged: Array<[SlackSearchHit, SlackReason]> = [
    ...found.dms.map((m): [SlackSearchHit, SlackReason] => [m, "dm"]),
    ...found.mentions.map((m): [SlackSearchHit, SlackReason] => [m, placeOf(m) === "DM" ? "dm" : "mention"]),
    // Search is lexical and loose ("at here" matches too), so keep real broadcasts only.
    ...found.groups.filter((m) => m.broadcast && placeOf(m) !== "DM").map((m): [SlackSearchHit, SlackReason] => [m, "group"]),
  ];
  const seen = new Set<string>();
  return tagged
    .filter(([m]) => m.fromId !== me)
    .map(([m, reason], i) => toItem(m, reason, i))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

// Read again after a while: reconnecting Slack as another account keeps the caller's label.
const USER_ID_TTL_MS = 60 * 60_000;
const userIds = processState("slack.userIdsByCaller", () => new Map<string, { id: string; at: number }>());

async function resolveUserId(caller: ToolCaller, configured: string | undefined): Promise<string> {
  if (configured !== undefined) return configured;
  const cached = userIds.get(caller.label);
  if (cached !== undefined && Date.now() - cached.at < USER_ID_TTL_MS) return cached.id;
  const description = await caller.describe(SEARCH_TOOL);
  const found = description === undefined ? undefined : USER_ID_IN_DESCRIPTION.exec(description)?.[1];
  if (found === undefined) {
    throw new Error("Could not find your Slack member ID. Enter it in Settings → Profile.");
  }
  userIds.set(caller.label, { id: found, at: Date.now() });
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
  const broadcast = (keyword: string) => search({ keywords: [keyword], only_my_channels: true }).catch((): Array<SlackSearchHit> => []);
  const [mentions, dms, here, channel] = await Promise.all([
    search({ keywords: [`<@${me}>`] }),
    search({ filters: "is:dm" }),
    options.groupMentions ? broadcast("<!here>") : [],
    options.groupMentions ? broadcast("<!channel>") : [],
  ]);
  return mergeSlackInbox({ mentions, dms, groups: [...here, ...channel] }, me);
}

const POSTS_PAGE_SIZE = 20;
/** Slack search pages are 20 messages; this caps a channel's history at 1,000. */
const POSTS_MAX_PAGES = 50;

/**
 * ### fetchMyChannelPosts
 *
 * Every message you posted in `channel` (thread replies too), oldest
 * first, following the search's pages to the end.
 *
 * @param userId - Your member id, else read from the search tool's description.
 * @throws Error When a call fails or its output can't be read.
 */
export async function fetchMyChannelPosts(caller: ToolCaller, channel: string, userId: string | undefined): Promise<Array<SlackSearchHit>> {
  const me = await resolveUserId(caller, userId);
  const posts: Array<SlackSearchHit> = [];
  let cursor: string | undefined;
  for (let page = 0; page < POSTS_MAX_PAGES; page++) {
    const text = await caller.callText(SEARCH_TOOL, {
      filters: `in:<#${channel}> from:<@${me}>`,
      natural_language_query: "",
      sort: "timestamp",
      sort_dir: "asc",
      include_context: false,
      limit: POSTS_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    posts.push(...parseSlackSearch(text));
    cursor = nextCursor(text);
    if (cursor === undefined) break;
  }
  return posts;
}

/** The next page's cursor from a search answer, which names it in `pagination_info`. */
function nextCursor(text: string): string | undefined {
  const info = responseSchema.safeParse(parseJson(text)).data?.pagination_info;
  return info === undefined ? undefined : /cursor `([^`]+)`/.exec(info)?.[1];
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
  note: "slack-recent",
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
