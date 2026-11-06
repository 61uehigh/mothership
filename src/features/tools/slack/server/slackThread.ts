import { z } from "zod";
import type { SlackThread, SlackThreadMessage } from "@/features/tools/model/Tools";
import { notFoundOn, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { parseJson, truncate, tsToEpoch } from "@/features/tools/server/sourceUtils";
import { senderName, slackToMarkdown } from "@/features/tools/slack/server/slackFormat";

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

function parseBlock(block: string, me: string | undefined): SlackThreadMessage | undefined {
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
  return {
    ts: tsLine.slice("Message TS: ".length).trim(),
    from: senderName(fromLine.slice("From: ".length)),
    at: tsToEpoch(tsLine.slice("Message TS: ".length).trim()),
    markdown: slackToMarkdown(body.join("\n"), me),
    reactions,
    files,
  };
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
  const parsed = responseSchema.safeParse(parseJson(text));
  if (!parsed.success) throw new Error(`Could not parse the Slack thread: ${truncate(text, 200)}`);
  const blocks = parsed.data.messages
    .split(/^=== THREAD PARENT MESSAGE ===$|^=== THREAD REPLIES.*===$|^--- Reply \d+ of \d+ ---$/m)
    .map((block) => block.trim())
    .filter((block) => block !== "");
  const messages = blocks.map((block) => parseBlock(block, me)).filter((m): m is SlackThreadMessage => m !== undefined);
  if (messages.length === 0) throw new Error(`Could not parse the Slack thread: ${truncate(text, 200)}`);
  return {
    channelId: link.channelId,
    focusTs: link.ts,
    messages,
    truncated: /there are more messages/i.test(parsed.data.pagination_info ?? ""),
    url: permalink,
  };
}
