"use client";

import { ToolListPane } from "@/features/tools/ui/ToolListPane";

/**
 * ### LinearPane
 *
 * Left sidebar list of open Linear issues you are subscribed to, from the `linear`
 * dashboard widget. A click previews the issue in a tab; a double click pins it.
 */
export function LinearPane() {
  return (
    <ToolListPane
      kind="linear"
      keys={{ refresh: "linear.refresh", empty: "linear.empty" }}
      tabFor={(item, title) => ({ kind: "issue", issueId: item.id, title })}
      isOpen={(tab, item) => tab.kind === "issue" && tab.issueId === item.id}
    />
  );
}
