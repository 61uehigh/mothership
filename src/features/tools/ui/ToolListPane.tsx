"use client";

import { useShell } from "@/shell/shellContext";
import { PaneHeader } from "@/shell/PaneHeader";
import type { Tab } from "@/shell/tabs";
import { useWorkbench } from "@/shell/workbenchContext";
import type { DashboardItem, ToolKind } from "@/features/tools/model/Dashboard";
import { draftFor } from "@/features/tools/ui/delegation";
import { ToolRow, usePaneTitle, useToolWidget, WidgetRefreshButton, WidgetStatus } from "@/features/tools/ui/toolPane";
import type { MessageKey } from "@/ui/i18n/messages";
import type { MessageParams } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { useNow } from "@/ui/useNow";

const CLOCK_TICK_MS = 30_000;

type PlainKey = { [K in MessageKey]: MessageParams<K> extends [] ? K : never }[MessageKey];

/**
 * ### ToolListPane
 *
 * A tool section that lists its dashboard widget's items: a header with
 * refresh, the widget's status, and one row per item. A click previews the
 * item's tab, a double click pins it (when `pinnable`), and the row's
 * button hands it to a new agent.
 *
 * @param keys - The refresh button's label and the empty message.
 * @param tabFor - The tab an item opens, given its title as the tool gave it (empty when none); `undefined` when it cannot open one.
 * @param isOpen - Whether `tab`, the active tab, shows `item`.
 */
export function ToolListPane({
  kind,
  keys,
  tabFor,
  isOpen,
  pinnable = true,
}: {
  kind: ToolKind;
  keys: { refresh: PlainKey; empty: PlainKey };
  tabFor: (item: DashboardItem, title: string) => Tab | undefined;
  isOpen: (tab: Tab, item: DashboardItem) => boolean;
  pinnable?: boolean;
}) {
  const t = useT();
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget(kind);
  const items = widget.result?.status === "ok" ? widget.result.items : [];
  const active = workbench.active?.tab;
  const open = (item: DashboardItem, preview: boolean) => {
    const tab = tabFor(item, item.title);
    if (tab !== undefined) workbench.open(tab, preview ? { preview: true } : undefined);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={usePaneTitle(widget, kind)}>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label={t(keys.refresh)} result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty={t(keys.empty)} />
        <ul>
          {items.map((item) => (
            <ToolRow
              key={item.id}
              item={item}
              now={now}
              selected={active !== undefined && isOpen(active, item)}
              onOpen={() => open(item, true)}
              onPin={pinnable ? () => open(item, false) : undefined}
              onHandOff={() => openNewAgent(draftFor(kind, item))}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
