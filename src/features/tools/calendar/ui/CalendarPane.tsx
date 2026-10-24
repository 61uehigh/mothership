"use client";

import { CalendarRange, Video } from "lucide-react";
import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { WidgetRefreshButton, ToolRow, useToolWidget, WidgetStatus } from "@/features/tools/ui/toolPane";
import { ICON_BUTTON } from "@/ui/IconButton";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/WorkbenchContext";
import { PaneHeader } from "@/shell/PaneHeader";
import type { DashboardItem } from "@/features/tools/model/Dashboard";

const CLOCK_TICK_MS = 30_000;

type Group = "Now" | "Next" | "Later" | "Earlier";
const GROUPS: Array<Group> = ["Now", "Next", "Later", "Earlier"];

// The calendar source marks the current and next events with a badge and ended ones as muted.
function groupOf(item: DashboardItem): Group {
  if (item.badge?.label === "Now") return "Now";
  if (item.badge?.label === "Next") return "Next";
  return item.muted ? "Earlier" : "Later";
}

/**
 * ### CalendarPane
 *
 * Left sidebar list of today's events from the `calendar` dashboard widget,
 * grouped into Now, Next, Later, and Earlier. A click opens the event in
 * Google Calendar; "Join meeting" opens its video link.
 */
export function CalendarPane() {
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const active = workbench.active?.tab;
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget("calendar");
  const items = widget.result?.status === "ok" ? widget.result.items : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={widget.info?.title ?? "Calendar"}>
        <button
          type="button"
          aria-label="Open day and week view"
          title="Open day and week view (G then C)"
          className={ICON_BUTTON}
          onClick={() => workbench.open({ kind: "calendar" })}
        >
          <CalendarRange size={14} />
        </button>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label="Refresh today's events" result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty="Nothing on your calendar today." />
        {GROUPS.map((group) => {
          const events = items.filter((item) => groupOf(item) === group);
          if (events.length === 0) return undefined;
          return (
            <section key={group} className="mb-2">
              <h4 className="px-2 py-1 text-[11px] font-medium text-zinc-500">{group}</h4>
              <ul>
                {events.map((item) => (
                  <ToolRow
                    key={item.id}
                    // The group heading already says Now or Next.
                    item={{ ...item, badge: undefined }}
                    now={0}
                    selected={active?.kind === "event" && active.eventId === item.id}
                    onOpen={() => workbench.open({ kind: "event", eventId: item.id, title: item.title }, { preview: true })}
                    onHandOff={() => openNewAgent(draftFor("calendar", item))}
                  >
                    {item.secondaryLink !== undefined && !item.muted && (
                      <a
                        href={item.secondaryLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1 ml-2 inline-flex items-center gap-1 rounded px-1 text-[11px] text-teal-700 hover:bg-teal-100/70 dark:text-teal-400 dark:hover:bg-teal-900/40"
                      >
                        <Video size={12} aria-hidden />
                        {item.secondaryLink.label}
                      </a>
                    )}
                  </ToolRow>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
