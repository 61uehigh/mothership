import { z } from "zod";
import type { ApiErrorCode } from "@/lib/apiErrorCodes";
import { HttpError } from "@/platform/http/HttpError";
import { envSecret } from "@/platform/envSecret";
import { postJson } from "@/platform/http/postJson";

const ENDPOINT = "https://slack.com/api/chat.postMessage";

/**
 * ### hasSlackUserToken
 *
 * Whether `SLACK_USER_TOKEN` is set. Then messages are sent with Slack's Web
 * API as you, without the "Sent using Claude" line Slack's MCP server adds
 * to every message an AI app sends.
 */
export function hasSlackUserToken(): boolean {
  return envSecret("SLACK_USER_TOKEN") !== undefined;
}

const responseSchema = z.object({ ok: z.boolean(), error: z.string().optional(), needed: z.string().optional() });

/** Where you change your Slack app's scopes and get a new token; the composer shows it as a link. */
const SLACK_APPS_URL = "https://api.slack.com/apps";

// Slack's `error` codes worth saying in words; the rest are shown as they are.
const ERRORS: Record<string, { message: string; status: number; code: ApiErrorCode }> = {
  invalid_auth: { message: "Slack refused your key. Replace it in Settings → Connections", status: 401, code: "slack-key-refused" },
  token_revoked: {
    message: `Your Slack key was revoked. Make a new one in your Slack app (${SLACK_APPS_URL}) and paste it in Settings → Connections`,
    status: 401,
    code: "slack-key-revoked",
  },
  channel_not_found: { message: "Slack has no such conversation, or you are not in it", status: 404, code: "slack-conversation-not-found" },
  not_in_channel: { message: "You are not in this channel", status: 403, code: "slack-not-in-channel" },
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
  const token = envSecret("SLACK_USER_TOKEN");
  if (token === undefined) throw new HttpError("Add your Slack key in Settings → Connections to send messages directly", 409, "slack-key-missing");
  const response = await postJson(
    ENDPOINT,
    {
      channel: input.channelId,
      markdown_text: input.text,
      ...(input.threadTs === undefined ? {} : { thread_ts: input.threadTs, reply_broadcast: input.broadcast }),
    },
    {
      service: "Slack",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      // A timeout may still have posted the message, so it is not retried.
      write: true,
    },
  );
  const body = responseSchema.safeParse(await response.json().catch(() => undefined));
  if (!body.success) throw new HttpError(`Slack answered ${response.status} without JSON`, 502);
  if (body.data.ok) return;
  const code = body.data.error ?? "unknown_error";
  if (code === "missing_scope") throw new HttpError(missingScopeMessage(body.data.needed ?? "chat:write"), 403, "slack-scope-missing");
  const known = ERRORS[code];
  throw new HttpError(known?.message ?? `Slack: ${code}`, known?.status ?? 502, known?.code);
}

/**
 * ### missingScopeMessage
 *
 * @param needed - The scope Slack says is missing, from its `needed` field.
 * @returns How to add it, ending with the link to your Slack apps.
 */
function missingScopeMessage(needed: string): string {
  return `Your Slack key lacks the ${needed} user scope. In your Slack app, add it under OAuth & Permissions → User Token Scopes, reinstall the app, and paste the new key in Settings → Connections: ${SLACK_APPS_URL}`;
}

const READ_TIMEOUT_MS = 10_000;

/**
 * ### SlackRawMessage
 *
 * The parts of a Slack Web API message that carry content besides `text`:
 * legacy attachments (unfurls and app cards) and Block Kit blocks, kept as
 * Slack sends them for `slackCard` to read.
 */
export type SlackRawMessage = { ts: string; attachments?: Array<unknown>; blocks?: Array<unknown>; metadata?: unknown };

const rawMessagesSchema = z.object({
  ok: z.boolean(),
  messages: z
    .array(z.object({ ts: z.string(), attachments: z.array(z.unknown()).optional(), blocks: z.array(z.unknown()).optional(), metadata: z.unknown().optional() }))
    .optional(),
});

/**
 * ### fetchSlackRawMessages
 *
 * Reads messages with Slack's Web API and your user token, for the cards the
 * Slack MCP server leaves out: a thread's replies (`threadTs`), or the
 * messages between two ts (`oldest`/`latest`, both included).
 *
 * @returns The messages by ts; empty when there is no token, the token lacks
 *   the history scope, or the call fails, since the cards are only a fallback.
 */
export async function fetchSlackRawMessages(
  channelId: string,
  range: { threadTs: string } | { oldest: string; latest: string },
): Promise<Map<string, SlackRawMessage>> {
  const token = envSecret("SLACK_USER_TOKEN");
  if (token === undefined) return new Map();
  const params = new URLSearchParams({ channel: channelId, limit: "200" });
  if ("threadTs" in range) params.set("ts", range.threadTs);
  else for (const [key, value] of Object.entries({ oldest: range.oldest, latest: range.latest, inclusive: "true" })) params.set(key, value);
  const method = "threadTs" in range ? "conversations.replies" : "conversations.history";
  try {
    const response = await fetch(`https://slack.com/api/${method}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    const body = rawMessagesSchema.safeParse(await response.json());
    if (!body.success || !body.data.ok) return new Map();
    return new Map((body.data.messages ?? []).map((m) => [m.ts, m]));
  } catch {
    return new Map();
  }
}
