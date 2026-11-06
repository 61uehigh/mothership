import { z } from "zod";
import { parseQuery, respondWith } from "@/app/api/_lib/http";
import { getDetailCache } from "@/composition/server";
import { fetchSlackConversation, fetchSlackThread, parseSlackPermalink } from "@/features/tools/slack/server/slackThread";
import { slackUserId } from "@/features/tools/slack/server/slackSource";
import { getDashboard } from "@/composition/server";
import { highlightNames } from "@/features/tools/server/sourceUtils";

const querySchema = z.object({
  url: z.string({ error: "url is required" }).trim().min(1, { error: "url is required" }).max(500),
  refresh: z.enum(["0", "1"]).default("0"),
  since: z.string().regex(/^\d+\.\d+$/).optional(),
});

/**
 * ### GET
 *
 * Reads a Slack message and its whole thread through the source of the
 * `slack` dashboard widget. `?url=` is the message permalink; `?since=`
 * (a Slack ts) reads the conversation from that message up to it instead,
 * for a message outside a thread; `?refresh=1` skips the ten-minute cache.
 *
 * @returns A `SlackThread`; 400 for a missing or non-Slack url, 404 when the
 *   message is gone, 409 when Slack is not set up, 502 when a call fails.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const { url, refresh, since } = query;
  const link = parseSlackPermalink(url);
  if (link === undefined) return Response.json({ error: "url is not a Slack message link" }, { status: 400 });
  const dashboard = getDashboard();
  const [me, names] = await Promise.all([dashboard.config().then(slackUserId), dashboard.myNames()]);
  const conversation = since !== undefined && link.threadTs === undefined ? since : undefined;
  const outcome = await getDetailCache().cached(`slack:${url}${conversation === undefined ? "" : `@${conversation}`}`, refresh === "1", () =>
    dashboard.callTool("slack", async (caller) => {
      const thread = conversation === undefined ? await fetchSlackThread(caller, url, link, me) : await fetchSlackConversation(caller, url, link, conversation, me);
      return { ...thread, messages: thread.messages.map((m) => ({ ...m, markdown: highlightNames(m.markdown, names) })) };
    }),
  );
  return respondWith(outcome, "Slack message");
}
