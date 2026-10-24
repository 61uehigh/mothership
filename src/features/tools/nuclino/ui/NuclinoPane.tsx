"use client";

import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { WidgetRefreshButton, ToolRow, useToolWidget, WidgetStatus } from "@/features/tools/ui/toolPane";
import { useNow } from "@/ui/useNow";
import { PaneHeader } from "@/shell/PaneHeader";
import { useWorkbench } from "@/shell/WorkbenchContext";

const CLOCK_TICK_MS = 30_000;

/**
 * ### NuclinoPane
 *
 * Left sidebar list of recently updated Nuclino docs from the `nuclino`
 * dashboard widget. A click previews the doc in a tab; a double click pins it.
 */
export function NuclinoPane() {
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget("nuclino");
  const items = widget.result?.status === "ok" ? widget.result.items : [];
  const activeId = workbench.active?.tab.kind === "doc" ? workbench.active.tab.itemId : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={widget.info?.title ?? "Nuclino"}>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label="Refresh Nuclino docs" result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty="No recent docs." />
        <ul>
          {items.map((item) => (
            <ToolRow
              key={item.id}
              item={item}
              now={now}
              selected={item.id === activeId}
              onOpen={() => workbench.open({ kind: "doc", itemId: item.id, title: item.title }, { preview: true })}
              onPin={() => workbench.open({ kind: "doc", itemId: item.id, title: item.title })}
              onHandOff={() => openNewAgent(draftFor("nuclino", item))}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
