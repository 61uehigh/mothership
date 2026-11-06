"use client";

import { ToolListPane } from "@/features/tools/ui/ToolListPane";

/**
 * ### SlackPane
 *
 * Left sidebar list of recent Slack mentions and DMs from the `slack`
 * dashboard widget. A click previews the message in a Slack tab.
 */
export function SlackPane() {
  return (
    <ToolListPane
      kind="slack"
      keys={{ refresh: "slack.refresh", empty: "slack.empty" }}
      tabFor={(item, title) => (item.url === undefined ? undefined : { kind: "slack", url: item.url, title })}
      isOpen={(tab, item) => tab.kind === "slack" && tab.url === item.url}
      pinnable={false}
    />
  );
}
