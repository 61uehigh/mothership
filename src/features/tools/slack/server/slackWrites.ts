import type { ToolCaller } from "@/platform/mcp/ToolCaller";

/**
 * ### SlackMessage
 *
 * A message to post. `threadTs` replies in that thread; `broadcast` also
 * shows the reply in the conversation.
 */
export type SlackMessage = { channelId: string; text: string; threadTs: string | undefined; broadcast: boolean };

/**
 * ### sendSlackMessage
 *
 * Posts through the Slack MCP server, as the person its token belongs to.
 */
export async function sendSlackMessage(caller: ToolCaller, { channelId, text, threadTs, broadcast }: SlackMessage): Promise<void> {
  await caller.callText("slack_send_message", {
    channel_id: channelId,
    message: text,
    ...(threadTs === undefined ? {} : { thread_ts: threadTs, reply_broadcast: broadcast }),
  });
}

/**
 * ### addSlackReaction
 *
 * @param emoji - An emoji name without colons, e.g. `eyes`.
 */
export async function addSlackReaction(caller: ToolCaller, channelId: string, ts: string, emoji: string): Promise<void> {
  await caller.callText("slack_add_reaction", { channel_id: channelId, message_ts: ts, emoji });
}
