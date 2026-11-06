"use client";

import { ToolListPane } from "@/features/tools/ui/ToolListPane";

/**
 * ### NotionPane
 *
 * Sidebar list of recent Notion pages from the `notion` dashboard widget.
 * A click previews the page in a tab; a double click pins it.
 */
export function NotionPane() {
  return (
    <ToolListPane
      kind="notion"
      keys={{ refresh: "notion.refresh", empty: "notion.empty" }}
      tabFor={(item, title) => ({ kind: "notion", pageId: item.id, title })}
      isOpen={(tab, item) => tab.kind === "notion" && tab.pageId === item.id}
    />
  );
}
