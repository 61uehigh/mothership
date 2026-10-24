import { z } from "zod";
import { parseBody, respondWith } from "@/app/api/_lib/http";
import { forgetAfterWrite } from "@/composition/server";
import { getDashboard } from "@/composition/server";

const bodySchema = z.object({
  channelId: z.string().regex(/^[A-Z0-9]{5,20}$/, { error: "channelId must be a Slack channel or DM id" }),
  text: z.string().trim().min(1, { error: "Write something first" }).max(5000),
  /** Reply in this thread; omit to post to the conversation itself. */
  threadTs: z.string().regex(/^\d+\.\d+$/).optional(),
  /** With `threadTs`: also show the reply in the conversation. */
  broadcast: z.boolean().default(false),
});

/**
 * ### POST
 *
 * Sends a Slack message as you through the `slack` widget's source. Body:
 * `{ channelId, text, threadTs?, broadcast? }`; `text` is Markdown.
 *
 * @returns `{ ok: true }`; 400 for invalid input, 409 when Slack is not set up, 502 when sending fails.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await parseBody(request, bodySchema);
  if (input instanceof Response) return input;
  const { channelId, text, threadTs, broadcast } = input;
  const outcome = await getDashboard().callTool("slack", async (caller) => {
    await caller.callText("slack_send_message", {
      channel_id: channelId,
      message: text,
      ...(threadTs === undefined ? {} : { thread_ts: threadTs, reply_broadcast: broadcast }),
    });
    return { ok: true };
  }, { write: true });
  if (outcome.status === "ok") await forgetAfterWrite("slack");
  return respondWith(outcome, "the Slack message");
}
