"use client";

import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { WidgetRefreshButton, ToolRow, useToolWidget, WidgetStatus } from "@/features/tools/ui/toolPane";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { PaneHeader } from "@/shell/PaneHeader";

const CLOCK_TICK_MS = 30_000;

/**
 * ### SlackPane
 *
 * Left sidebar list of recent Slack mentions and DMs from the `slack`
 * dashboard widget. A click opens the message in Slack in a new browser tab.
 */
export function SlackPane() {
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const active = workbench.active?.tab;
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget("slack");
  const items = widget.result?.status === "ok" ? widget.result.items : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={widget.info?.title ?? "Slack"}>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label="Refresh Slack messages" result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty="No recent mentions or DMs." />
        <ul>
          {items.map((item) => (
            <ToolRow
              key={item.id}
              item={item}
              now={now}
              selected={active?.kind === "slack" && active.url === item.url}
              onOpen={() =>
                item.url === undefined ? undefined : workbench.open({ kind: "slack", url: item.url, title: item.title }, { preview: true })
              }
              onHandOff={() => openNewAgent(draftFor("slack", item))}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
