import type { LinearNotification } from "@/features/tools/model/Tools";
import type { DashboardService } from "@/features/tools/server/DashboardService";
import { LINEAR_NOTIFICATIONS_KEY, type DetailCache } from "@/features/tools/server/DetailCache";
import { toolValue } from "@/features/tools/server/toolFailure";
import { fetchLinearNotifications, markLinearNotifications } from "@/features/tools/linear/server/linearSource";

type LinearAccess = { dashboard: Pick<DashboardService, "callTool">; details: DetailCache };

/**
 * ### cachedLinearNotifications
 *
 * Your Linear notifications, cached like other details.
 *
 * @param refresh - Skip the cache.
 * @returns `undefined` when Linear is off or the call fails, so the Inbox just leaves them out.
 */
export async function cachedLinearNotifications({ dashboard, details }: LinearAccess, refresh: boolean): Promise<Array<LinearNotification> | undefined> {
  const outcome = await details.cached(LINEAR_NOTIFICATIONS_KEY, refresh, () =>
    dashboard.callTool("linear", (caller) => fetchLinearNotifications(caller, Date.now())),
  );
  return outcome.status === "ok" ? outcome.value : undefined;
}

/**
 * ### markLinear
 *
 * Marks notifications read or unread in Linear, then forgets the cached
 * list so the Inbox shows Linear's new state.
 *
 * @throws {@link HttpError} When Linear is not set up or a call fails.
 */
export async function markLinear({ dashboard, details }: LinearAccess, ids: Array<string>, read: boolean): Promise<void> {
  await toolValue(await dashboard.callTool("linear", (caller) => markLinearNotifications(caller, ids, read), { write: true }));
  details.forget(LINEAR_NOTIFICATIONS_KEY);
}
