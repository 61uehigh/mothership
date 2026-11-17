"use client";

import { Bell, BellOff, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { NotificationState } from "@/features/notifications/model/NotificationState";
import { isUsageStale, type ProviderUsage, type UsageSnapshot, type UsageWindow } from "@/features/usage/model/Usage";
import { openSettingsPage } from "@/shell/settingsPage";
import { useWorkbenchActions } from "@/shell/WorkbenchContext";
import { MeterBar, MeterPercent } from "@/ui/meter";
import { fetchJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { usePageVisible } from "@/ui/usePageVisible";

const POLL_MS = 30_000;

function resetLabel(window: UsageWindow): string {
  if (window.resetsAt === undefined) return "";
  return ` · resets ${new Date(window.resetsAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function Meter({
  label,
  percent,
  title,
  stale,
  onOpen,
  className = "flex",
}: {
  label: string;
  percent: number | undefined;
  title: string;
  stale: boolean;
  /** Opens the Settings page with the details. */
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button type="button" onClick={onOpen} className={`${className} items-center gap-1.5 rounded hover:text-zinc-900 dark:hover:text-zinc-100 ${stale ? "opacity-50" : ""}`} title={`${title}. Click for details`}>
      <span className="text-zinc-500">{label}</span>
      <MeterBar percent={percent} className="h-1.5 w-8 sm:w-12" />
      <MeterPercent percent={percent} className="w-8 text-right" />
    </button>
  );
}

function ProviderMeters({ name, usage, now, onOpen }: { name: string; usage: ProviderUsage | undefined; now: number; onOpen: () => void }) {
  // On phones only the 5-hour windows fit; weekly ones appear from the sm breakpoint.
  const stale = isUsageStale(usage, now);
  const observed = usage === undefined ? "No runs yet" : `as of ${new Date(usage.observedAt).toLocaleTimeString("en-US")}`;
  return (
    <>
      <Meter
        label={`${name} 5h`}
        percent={usage?.fiveHour?.usedPercent}
        stale={stale}
        onOpen={onOpen}
        title={`${name} 5-hour limit · ${observed}${usage?.fiveHour === undefined ? "" : resetLabel(usage.fiveHour)}`}
      />
      <Meter
        className="hidden sm:flex"
        label={`${name} weekly`}
        percent={usage?.weekly?.usedPercent}
        stale={stale}
        onOpen={onOpen}
        title={`${name} weekly limit · ${observed}${usage?.weekly === undefined ? "" : resetLabel(usage.weekly)}`}
      />
    </>
  );
}

/** How often the clock re-renders; it shows minutes, so a few seconds late is fine. */
const CLOCK_TICK_MS = 5_000;

/**
 * ### StatusBar
 *
 * Bottom bar: Claude and Codex subscription limits, CPU, memory, the
 * notification switch, and a clock. Limits come from each provider's last
 * run, so they update whenever an agent works; ↻ asks Claude directly.
 * Each item opens its Settings page: Usage, This Mac, General, or You.
 */
export function StatusBar({
  notifications,
  onToggleNotifications,
}: {
  notifications: NotificationState;
  onToggleNotifications: () => void;
}) {
  const [usage, setUsage] = useState<UsageSnapshot | undefined>(undefined);
  const [probing, setProbing] = useState(false);
  // The clock ticks on its own; it used to move only when a usage poll landed, up to 30 s late.
  const now = useNow(CLOCK_TICK_MS);
  const visible = usePageVisible();
  const workbench = useWorkbenchActions();
  const openAgentLimits = () => workbench.open({ kind: "agent-limits" });
  const openSystem = () => workbench.open({ kind: "system" });

  const load = useCallback(async (probe: boolean) => {
    // A failed load (the server restarting, say) keeps the last numbers; the next poll tries again.
    const result = await fetchJson<UsageSnapshot>("/api/usage", { method: probe ? "POST" : "GET" });
    if (result.ok) setUsage(result.data);
  }, []);

  useEffect(() => {
    // No polling while the window is hidden; showing it again loads at once.
    if (!visible) return;
    // Deferred a tick: `load` sets state, which must not happen synchronously in an effect.
    const first = setTimeout(() => void load(false), 0);
    const timer = setInterval(() => void load(false), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, visible]);

  return (
    <footer data-usage-area="statusbar" className="flex items-center gap-x-3 overflow-hidden border-t border-zinc-200 px-3 py-1.5 text-[11px] whitespace-nowrap sm:gap-x-4 sm:px-4 dark:border-zinc-800">
      <ProviderMeters name="Claude" usage={usage?.claude} now={now} onOpen={openAgentLimits} />
      <button
        type="button"
        disabled={probing}
        title="Check Claude limits now (one Haiku call, about $0.002)"
        className="text-zinc-500 hover:text-zinc-900 disabled:animate-spin dark:hover:text-zinc-100"
        onClick={() => {
          setProbing(true);
          void load(true).finally(() => setProbing(false));
        }}
      >
        <RotateCw size={12} aria-label="Check Claude limits" />
      </button>
      <ProviderMeters name="Codex" usage={usage?.codex} now={now} onOpen={openAgentLimits} />
      <span className="ml-auto flex shrink-0 items-center gap-4">
        <Meter className="hidden xl:flex" label="CPU" percent={usage?.cpuPercent} stale={false} onOpen={openSystem} title="Average CPU usage over the last 30 seconds" />
        <Meter className="hidden xl:flex" label="MEM" percent={usage?.memoryPercent} stale={false} onOpen={openSystem} title="Memory usage (excluding cache)" />
        {notifications !== "unsupported" && (
          <button
            type="button"
            onClick={onToggleNotifications}
            title={
              notifications === "granted"
                ? "Browser notifications on: you'll be notified of questions, completions, and failures while this tab is in the background"
                : notifications === "denied"
                  ? "Notifications are blocked in your browser settings"
                  : notifications === "muted"
                    ? "Browser notifications are muted here. Click to turn them back on"
                    : "Turn on browser notifications"
            }
            aria-label={notifications === "granted" ? "Browser notifications on" : "Browser notifications off"}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {notifications === "granted" ? <Bell size={13} /> : <BellOff size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => openSettingsPage("profile", () => workbench.open({ kind: "settings" }))}
          title="This Mac's time. Your time zone for the calendar is in Settings → Profile"
          className="hidden font-mono tabular-nums text-zinc-500 hover:text-zinc-900 sm:inline dark:hover:text-zinc-100"
        >
          {now > 0 && new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </button>
      </span>
    </footer>
  );
}
