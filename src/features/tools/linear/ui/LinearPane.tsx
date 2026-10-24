"use client";

import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { WidgetRefreshButton, ToolRow, useToolWidget, WidgetStatus } from "@/features/tools/ui/toolPane";
import { useNow } from "@/ui/useNow";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";

const CLOCK_TICK_MS = 30_000;

/**
 * ### LinearPane
 *
 * Left sidebar list of Linear issues assigned to you, from the `linear`
 * dashboard widget. A click previews the issue in a tab; a double click pins it.
 */
export function LinearPane() {
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget("linear");
  const items = widget.result?.status === "ok" ? widget.result.items : [];
  const activeId = workbench.active?.tab.kind === "issue" ? workbench.active.tab.issueId : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={widget.info?.title ?? "Linear"}>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label="Refresh Linear issues" result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty="No issues assigned to you." />
        <ul>
          {items.map((item) => (
            <ToolRow
              key={item.id}
              item={item}
              now={now}
              selected={item.id === activeId}
              onOpen={() => workbench.open({ kind: "issue", issueId: item.id, title: item.title }, { preview: true })}
              onPin={() => workbench.open({ kind: "issue", issueId: item.id, title: item.title })}
              onHandOff={() => openNewAgent(draftFor("linear", item))}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
