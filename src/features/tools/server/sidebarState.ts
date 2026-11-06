import { isConnectionId, type SidebarState } from "@/features/settings/model/Settings";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { slackUserId } from "@/features/tools/slack/server/slackSource";

/**
 * ### sidebarState
 *
 * How the sidebar reads each tool, as Settings shows it: each connection's
 * first widget (later ones for the same server are ignored), and your profile.
 * Widgets without a server, or on a server that is not a Settings
 * connection, are left out. Also the time zone in use.
 */
export function sidebarState(config: DashboardConfig): SidebarState {
  const widgets: SidebarState["widgets"] = {};
  for (const widget of config.widgets) {
    if (!("server" in widget) || !isConnectionId(widget.server)) continue;
    widgets[widget.server] ??= { via: widget.via, disabled: widget.disabled };
  }
  return { widgets, profile: { names: config.me.names, slackUserId: slackUserId(config) }, timezone: { effective: config.timezone, automatic: config.automaticTimezone } };
}
