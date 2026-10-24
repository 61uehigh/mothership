import { z } from "zod";
import { parseBody, respondWith } from "@/app/api/_lib/http";
import { forgetAfterWrite } from "@/composition/server";
import { getDashboard } from "@/composition/server";

const bodySchema = z.object({
  channelId: z.string().regex(/^[A-Z0-9]{5,20}$/),
  ts: z.string().regex(/^\d+\.\d+$/),
  emoji: z.string().regex(/^[a-z0-9_+-]{1,64}$/, { error: "emoji must be a name such as eyes" }),
});

/**
 * ### POST
 *
 * Adds an emoji reaction to a Slack message as you. Body: `{ channelId, ts, emoji }`.
 * The Slack connector cannot remove reactions.
 *
 * @returns `{ ok: true }`; 400 for invalid input, 409 when Slack is not set up, 502 when it fails.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await parseBody(request, bodySchema);
  if (input instanceof Response) return input;
  const { channelId, ts, emoji } = input;
  const outcome = await getDashboard().callTool("slack", async (caller) => {
    await caller.callText("slack_add_reaction", { channel_id: channelId, message_ts: ts, emoji });
    return { ok: true };
  }, { write: true });
  if (outcome.status === "ok") await forgetAfterWrite("slack");
  return respondWith(outcome, "the reaction");
}
