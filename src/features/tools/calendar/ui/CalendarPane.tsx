"use client";

import { CalendarRange, Video } from "lucide-react";
import { useShell } from "@/shell/shellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { WidgetRefreshButton, ToolRow, useToolWidget, WidgetStatus, usePaneTitle } from "@/features/tools/ui/toolPane";
import { ICON_BUTTON } from "@/ui/iconButtons";
import { useNow } from "@/ui/useNow";
import { useWorkbench } from "@/shell/workbenchContext";
import { PaneHeader } from "@/shell/PaneHeader";
import type { CalendarEventState, DashboardItem } from "@/features/tools/model/Dashboard";
import { useT } from "@/ui/i18n/useT";

const CLOCK_TICK_MS = 30_000;

const GROUPS = [
  { state: "now", label: "calendar.group.now" },
  { state: "next", label: "calendar.group.next" },
  { state: "later", label: "calendar.group.later" },
  { state: "past", label: "calendar.group.earlier" },
] as const satisfies ReadonlyArray<{ state: CalendarEventState; label: string }>;

/** Only a timed event that has ended (shown muted) goes under Earlier. */
function groupOf(item: DashboardItem): CalendarEventState {
  const state = item.event?.state ?? "later";
  return state === "past" && !item.muted ? "later" : state;
}

/**
 * ### CalendarPane
 *
 * Left sidebar list of today's events from the `calendar` dashboard widget,
 * grouped into Now, Next, Later, and Earlier. A click previews the event in
 * an event tab; the meeting link opens its video call in the browser.
 */
export function CalendarPane() {
  const t = useT();
  const { openNewAgent } = useShell();
  const workbench = useWorkbench();
  const active = workbench.active?.tab;
  const now = useNow(CLOCK_TICK_MS);
  const widget = useToolWidget("calendar");
  // The widget loads the week ahead for the Inbox; this list is today's.
  const items = widget.result?.status === "ok" ? widget.result.items.filter((item) => item.event?.today !== false) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title={usePaneTitle(widget, "calendar")}>
        <button
          type="button"
          aria-label={t("calendar.openView")}
          title={t("calendar.openViewHint")}
          className={ICON_BUTTON}
          onClick={() => workbench.open({ kind: "calendar" })}
        >
          <CalendarRange size={14} />
        </button>
        <WidgetRefreshButton loading={widget.loading} onClick={widget.refresh} label={t("calendar.refresh")} result={widget.result} now={now} />
      </PaneHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <WidgetStatus widget={widget} itemCount={items.length} empty={t("calendar.empty")} />
        {GROUPS.map(({ state, label }) => {
          const events = items.filter((item) => groupOf(item) === state);
          if (events.length === 0) return undefined;
          return (
            <section key={state} className="mb-2">
              <h4 className="px-2 py-1 text-[11px] font-medium text-zinc-500">{t(label)}</h4>
              <ul>
                {events.map((item) => (
                  <ToolRow
                    key={item.id}
                    item={item}
                    now={0}
                    selected={active?.kind === "event" && active.eventId === item.id}
                    onOpen={() => workbench.open({ kind: "event", eventId: item.id, title: item.title }, { preview: true })}
                    onHandOff={() => openNewAgent(draftFor("calendar", item))}
                  >
                    {item.meetingUrl !== undefined && !item.muted && (
                      <a
                        href={item.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-1 ml-2 inline-flex items-center gap-1 rounded px-1 text-[11px] text-teal-700 hover:bg-teal-100/70 dark:text-teal-400 dark:hover:bg-teal-900/40"
                      >
                        <Video size={12} aria-hidden />
                        {t("calendar.joinMeeting")}
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
