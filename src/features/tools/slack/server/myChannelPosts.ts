import type { DashboardService } from "@/features/tools/server/DashboardService";
import { toolValue } from "@/features/tools/server/toolFailure";
import { fetchMyChannelPosts, slackUserId, type SlackSearchHit } from "@/features/tools/slack/server/slackSource";

/**
 * ### myChannelPosts
 *
 * @param author - Whose messages; your Slack member id from Settings when omitted.
 * @param purpose - What the calls are for, as the call log names them.
 * @returns Your messages in the Slack channel `channel`, oldest first.
 * @throws {@link HttpError} 409 when Slack is not set up, 502 when the search fails.
 */
export async function myChannelPosts(
  dashboard: Pick<DashboardService, "config" | "callTool">,
  channel: string,
  author: string | undefined,
  purpose: string,
): Promise<Array<SlackSearchHit>> {
  const userId = author ?? slackUserId(await dashboard.config());
  return toolValue(await dashboard.callTool("slack", (caller) => fetchMyChannelPosts(caller, channel, userId), { purpose: { source: purpose, background: false } }));
}
