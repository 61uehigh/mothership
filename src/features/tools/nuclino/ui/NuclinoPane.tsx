"use client";

import { ToolListPane } from "@/features/tools/ui/ToolListPane";

/**
 * ### NuclinoPane
 *
 * Left sidebar list of recently updated Nuclino docs from the `nuclino`
 * dashboard widget. A click previews the doc in a tab; a double click pins it.
 */
export function NuclinoPane() {
  return (
    <ToolListPane
      kind="nuclino"
      keys={{ refresh: "nuclino.refresh", empty: "nuclino.empty" }}
      tabFor={(item, title) => ({ kind: "doc", itemId: item.id, title })}
      isOpen={(tab, item) => tab.kind === "doc" && tab.itemId === item.id}
    />
  );
}
