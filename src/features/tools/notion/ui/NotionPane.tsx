"use client";

import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { WidgetRefreshButton, ToolRow, useToolWidget, WidgetStatus } from "@/features/tools/ui/toolPane";
import { useNow } from "@/ui/useNow";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";

const CLOCK_TICK_MS = 30_000;

/**
 * ### NotionPane
 *
 * Sidebar list of recent Notion pages from the `notion` dashboard widget.
 * A click previews the page in a tab; a double click pins it.
 */
export function NotionPane() {
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget("notion");
  const items = widget.result?.status === "ok" ? widget.result.items : [];
  const activeId = workbench.active?.tab.kind === "notion" ? workbench.active.tab.pageId : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={widget.info?.title ?? "Notion"}>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label="Refresh Notion pages" result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty="No recent pages." />
        <ul>
          {items.map((item) => (
            <ToolRow
              key={item.id}
              item={item}
              now={now}
              selected={item.id === activeId}
              onOpen={() => workbench.open({ kind: "notion", pageId: item.id, title: item.title }, { preview: true })}
              onPin={() => workbench.open({ kind: "notion", pageId: item.id, title: item.title })}
              onHandOff={() => openNewAgent(draftFor("notion", item))}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
