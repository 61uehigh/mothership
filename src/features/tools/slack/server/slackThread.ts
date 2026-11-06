import { z } from "zod";
import type { SlackThread, SlackThreadMessage } from "@/features/tools/model/Tools";
import { notFoundOn, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { parseJson, truncate, tsToEpoch } from "@/features/tools/server/sourceUtils";
import { fetchSlackRawMessages } from "@/features/tools/slack/server/slackApi";
import { cleanSlackText, senderName, slackCard, slackToMarkdown, splitSlackBody, unquoteSlackBody } from "@/features/tools/slack/server/slackFormat";

const READ_THREAD_TOOL = "slack_read_thread";
const REPLY_LIMIT = 200;

// `slack_read_thread` answers `{ messages, pagination_info }`; `messages` is labelled text
// (checked against real calls): a `=== THREAD PARENT MESSAGE ===` block, then `--- Reply n of m ---` blocks.
const responseSchema = z.object({ messages: z.string(), pagination_info: z.string().optional() });

/**
 * ### SlackPermalink
 *
 * Where a Slack permalink points.
 */
export type SlackPermalink = { channelId: string; ts: string; threadTs: string | undefined };

/**
 * ### parseSlackPermalink
 *
 * Reads `https://x.slack.com/archives/C123/p1792659089594709?thread_ts=…`.
 *
 * @returns The channel and message timestamps, or `undefined` for other URLs.
 */
export function parseSlackPermalink(url: string): SlackPermalink | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!parsed.hostname.endsWith(".slack.com")) return undefined;
  const match = /^\/archives\/([A-Z0-9]+)\/p(\d{7,})$/.exec(parsed.pathname);
  if (match === null) return undefined;
  const digits = match[2];
  const threadTs = parsed.searchParams.get("thread_ts");
  return {
    channelId: match[1],
    // Permalinks drop the dot of the ts; the last six digits are microseconds.
    ts: `${digits.slice(0, -6)}.${digits.slice(-6)}`,
    threadTs: threadTs !== null && /^\d+\.\d+$/.test(threadTs) ? threadTs : undefined,
  };
}

/** A message with the member id of who sent it, from its `From:` line. */
type Parsed = { message: SlackThreadMessage; fromId: string | undefined };

/**
 * ### dmPartner
 *
 * The name of whoever you talk to in a DM: the first sender who is not you.
 *
 * @param channelId - DM ids start with `D`; for any other channel there is none.
 */
export function dmPartner(channelId: string, parsed: ReadonlyArray<Parsed>, me: string | undefined): string | undefined {
  if (!channelId.startsWith("D")) return undefined;
  return parsed.find((p) => p.fromId !== undefined && p.fromId !== me && p.message.from !== "")?.message.from;
}

function parseBlock(block: string, me: string | undefined): Parsed | undefined {
  const lines = block.split("\n");
  const fromLine = lines.find((l) => l.startsWith("From: "));
  const tsLine = lines.find((l) => l.startsWith("Message TS: "));
  if (fromLine === undefined || tsLine === undefined) return undefined;
  const bodyStart = lines.indexOf(tsLine) + 1;
  const body: Array<string> = [];
  const reactions: SlackThreadMessage["reactions"] = [];
  const files: Array<string> = [];
  for (const line of lines.slice(bodyStart)) {
    if (line.startsWith("Reactions: ")) {
      for (const part of line.slice("Reactions: ".length).split(/,\s*/)) {
        const match = /^(.+?) \((\d+)\)$/.exec(part.trim());
        if (match !== null) reactions.push({ name: match[1], count: Number(match[2]) });
      }
    } else if (line.startsWith("Files: ")) {
      for (const part of line.slice("Files: ".length).split(/\),\s*/)) {
        files.push(part.replace(/\(ID: \w+,\s*/, "(").replace(/\)?$/, ")"));
      }
    } else if (line !== "No thread messsages" && line !== "No thread messages") {
      body.push(line);
    }
  }
  // Apps and bots post from `…@slack-bots.com` addresses, or are marked `[BOT]` in search results.
  const bot = /@slack-bots\.com>|\[BOT\]/.test(fromLine);
  const { text, context } = splitSlackBody(unquoteSlackBody(body.join("\n")), bot);
  const message = {
    ts: tsLine.slice("Message TS: ".length).trim(),
    from: senderName(fromLine.slice("From: ".length)),
    at: tsToEpoch(tsLine.slice("Message TS: ".length).trim()),
    markdown: slackToMarkdown(text, me),
    context: context.map(cleanSlackText),
    reactions,
    files,
  };
  // `Name <address> (U123)` in threads, `Name (ID: U123)` elsewhere; bots and apps have U or B ids too.
  return { message, fromId: /\((?:ID: )?([UWB][A-Z0-9]+)\)/.exec(fromLine)?.[1] };
}

/**
 * Fills in messages the Slack MCP server gave no text, such as an app's card
 * (Linear's issue preview), from the Web API's attachments and blocks. Needs
 * your user token with the history scope; without it they stay empty.
 */
async function withCards(
  messages: Array<SlackThreadMessage>,
  channelId: string,
  range: Parameters<typeof fetchSlackRawMessages>[1],
  me: string | undefined,
): Promise<Array<SlackThreadMessage>> {
  if (!messages.some((m) => m.markdown === "" && m.files.length === 0)) return messages;
  const raw = await fetchSlackRawMessages(channelId, range);
  return messages.map((m) => {
    const card = m.markdown === "" ? raw.get(m.ts) : undefined;
    if (card === undefined) return m;
    const { text, context } = slackCard(card);
    return { ...m, markdown: slackToMarkdown(text, me), context: [...context.map(cleanSlackText), ...m.context] };
  });
}

/**
 * ### fetchSlackThread
 *
 * Reads the message a permalink points to with its whole thread.
 *
 * @throws Error When the call fails or its output is not the expected shape.
 */
export async function fetchSlackThread(
  caller: ToolCaller,
  permalink: string,
  link: SlackPermalink,
  me: string | undefined,
): Promise<SlackThread> {
  const text = await notFoundOn(caller.callText(READ_THREAD_TOOL, {
    channel_id: link.channelId,
    message_ts: link.threadTs ?? link.ts,
    limit: REPLY_LIMIT,
  }), /thread_not_found|message_not_found|channel_not_found/);
  const response = responseSchema.safeParse(parseJson(text));
  if (!response.success) throw new Error(`Could not parse the Slack thread: ${truncate(text, 200)}`);
  const blocks = response.data.messages
    .split(/^=== THREAD PARENT MESSAGE ===$|^=== THREAD REPLIES.*===$|^--- Reply \d+ of \d+ ---$/m)
    .map((block) => block.trim())
    .filter((block) => block !== "");
  const parsed = blocks.map((block) => parseBlock(block, me)).filter((p) => p !== undefined);
  const messages = parsed.map((p) => p.message);
  if (messages.length === 0) throw new Error(`Could not parse the Slack thread: ${truncate(text, 200)}`);
  return {
    channelId: link.channelId,
    focusTs: link.ts,
    messages: await withCards(messages, link.channelId, { threadTs: link.threadTs ?? link.ts }, me),
    truncated: /there are more messages/i.test(response.data.pagination_info ?? ""),
    url: permalink,
    conversation: false,
    partner: dmPartner(link.channelId, parsed, me),
  };
}

const READ_CHANNEL_TOOL = "slack_read_channel";
const CONVERSATION_LIMIT = 100;
// `slack_read_channel` answers `{ messages, pagination_info }`, newest first:
// `=== Message from <name> <email> (<id>) at <time> ===` headers, then `Message TS:` and the text.
const channelSchema = z.object({ messages: z.string(), pagination_info: z.string().optional() });

/** A Slack ts moved by one microsecond, to make Slack's exclusive time bounds include the message itself. */
function nudge(ts: string, by: 1 | -1): string {
  const [seconds, micros = "0"] = ts.split(".");
  // Microseconds since the epoch stay well within a safe integer.
  const total = Number(seconds) * 1_000_000 + Number(micros.padEnd(6, "0").slice(0, 6)) + by;
  return `${Math.floor(total / 1_000_000)}.${String(total % 1_000_000).padStart(6, "0")}`;
}

/**
 * ### fetchSlackConversation
 *
 * Reads the channel or DM a permalink points to, from the message at
 * `since` up to the linked one, oldest first: a grouped Inbox row's
 * messages with whatever was said between them.
 *
 * @throws Error When the call fails or its output is not the expected shape.
 */
export async function fetchSlackConversation(
  caller: ToolCaller,
  permalink: string,
  link: SlackPermalink,
  since: string,
  me: string | undefined,
): Promise<SlackThread> {
  const text = await notFoundOn(caller.callText(READ_CHANNEL_TOOL, {
    channel_id: link.channelId,
    oldest: nudge(since, -1),
    latest: nudge(link.ts, 1),
    limit: CONVERSATION_LIMIT,
  }), /channel_not_found/);
  const response = channelSchema.safeParse(parseJson(text));
  if (!response.success) throw new Error(`Could not parse the Slack conversation: ${truncate(text, 200)}`);
  const parsed = response.data.messages
    .split(/^=== Message from (.*) at .* === ?$/m)
    // split keeps the captured sender: [preamble, from, body, from, body, …]
    .flatMap((part, i, parts) => (i % 2 === 1 ? [parseBlock(`From: ${part}\n${parts[i + 1] ?? ""}`.trim(), me)] : []))
    .filter((p) => p !== undefined)
    .reverse();
  const messages = parsed.map((p) => p.message);
  if (messages.length === 0) throw new Error(`Could not parse the Slack conversation: ${truncate(text, 200)}`);
  return {
    channelId: link.channelId,
    focusTs: link.ts,
    messages: await withCards(messages, link.channelId, { oldest: since, latest: link.ts }, me),
    truncated: /there are more messages/i.test(response.data.pagination_info ?? ""),
    url: permalink,
    conversation: true,
    partner: dmPartner(link.channelId, parsed, me),
  };
}
