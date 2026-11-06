import { z } from "zod";
import { HttpError } from "@/platform/http/HttpError";

const ENDPOINT = "https://slack.com/api/chat.postMessage";
const TIMEOUT_MS = 15_000;

/**
 * ### hasSlackUserToken
 *
 * Whether `SLACK_USER_TOKEN` is set. Then messages are sent with Slack's Web
 * API as you, without the "Sent using Claude" line Slack's MCP server adds
 * to every message an AI app sends.
 */
export function hasSlackUserToken(): boolean {
  // The .env template leaves this as an empty string.
  return (process.env.SLACK_USER_TOKEN ?? "") !== "";
}

const responseSchema = z.object({ ok: z.boolean(), error: z.string().optional() });

// Slack's `error` codes worth saying in words; the rest are shown as they are.
const ERRORS: Record<string, { message: string; status: number }> = {
  invalid_auth: { message: "Slack refused SLACK_USER_TOKEN. Check the token in Settings → Connections", status: 401 },
  token_revoked: { message: "SLACK_USER_TOKEN was revoked. Make a new one in your Slack app", status: 401 },
  missing_scope: { message: "SLACK_USER_TOKEN lacks the chat:write user scope. Add it in your Slack app and reinstall it", status: 403 },
  channel_not_found: { message: "Slack has no such conversation, or you are not in it", status: 404 },
  not_in_channel: { message: "You are not in this channel", status: 403 },
};

/**
 * ### postSlackMessage
 *
 * Sends a message as you with `chat.postMessage` and your user token.
 *
 * @param text - Standard Markdown, which Slack renders itself (`markdown_text`).
 * @throws HttpError When the token is missing (409) or Slack refuses the message.
 */
export async function postSlackMessage(input: { channelId: string; text: string; threadTs?: string; broadcast: boolean }): Promise<void> {
  const token = process.env.SLACK_USER_TOKEN;
  if (token === undefined || token === "") throw new HttpError("Set SLACK_USER_TOKEN to send Slack messages directly", 409);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        channel: input.channelId,
        markdown_text: input.text,
        ...(input.threadTs === undefined ? {} : { thread_ts: input.threadTs, reply_broadcast: input.broadcast }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout may still have posted the message, so it is not retried.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new HttpError(timedOut ? "Slack did not answer in time; check the conversation before sending again" : "Could not reach Slack", timedOut ? 504 : 502);
  }
  const body = responseSchema.safeParse(await response.json().catch(() => undefined));
  if (!body.success) throw new HttpError(`Slack answered ${response.status} without JSON`, 502);
  if (body.data.ok) return;
  const code = body.data.error ?? "unknown_error";
  const known = ERRORS[code];
  throw new HttpError(known?.message ?? `Slack: ${code}`, known?.status ?? 502);
}
