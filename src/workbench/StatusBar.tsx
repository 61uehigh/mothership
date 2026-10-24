"use client";

import { Bell, BellOff, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { NotificationState } from "@/features/notifications/model/NotificationState";
import type { ProviderUsage, UsageSnapshot, UsageWindow } from "@/features/usage/model/Usage";

const POLL_MS = 30_000;
/** Older than this, numbers are shown dimmed as stale. */
const STALE_MS = 60 * 60_000;

function barColor(percent: number): string {
  if (percent >= 95) return "bg-red-500";
  if (percent >= 80) return "bg-amber-500";
  return "bg-teal-500";
}

function resetLabel(window: UsageWindow): string {
  if (window.resetsAt === undefined) return "";
  return ` · resets ${new Date(window.resetsAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function Meter({
  label,
  percent,
  title,
  stale,
  className = "flex",
}: {
  label: string;
  percent: number | undefined;
  title: string;
  stale: boolean;
  className?: string;
}) {
  return (
    <span className={`${className} items-center gap-1.5 ${stale ? "opacity-50" : ""}`} title={title}>
      <span className="text-zinc-500">{label}</span>
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-zinc-200 sm:w-12 dark:bg-zinc-800">
        {percent !== undefined && <span className={`block h-full ${barColor(percent)}`} style={{ width: `${Math.min(percent, 100)}%` }} />}
      </span>
      <span className="w-8 text-right font-mono tabular-nums">{percent === undefined ? "–" : `${percent}%`}</span>
    </span>
  );
}

function ProviderMeters({ name, usage, now }: { name: string; usage: ProviderUsage | undefined; now: number }) {
  // On phones only the 5-hour windows fit; weekly ones appear from the sm breakpoint.
  const stale = usage === undefined || now - usage.observedAt > STALE_MS;
  const observed = usage === undefined ? "No runs yet" : `as of ${new Date(usage.observedAt).toLocaleTimeString("en-US")}`;
  return (
    <>
      <Meter
        label={`${name} 5h`}
        percent={usage?.fiveHour?.usedPercent}
        stale={stale}
        title={`${name} 5-hour limit · ${observed}${usage?.fiveHour === undefined ? "" : resetLabel(usage.fiveHour)}`}
      />
      <Meter
        className="hidden sm:flex"
        label={`${name} weekly`}
        percent={usage?.weekly?.usedPercent}
        stale={stale}
        title={`${name} weekly limit · ${observed}${usage?.weekly === undefined ? "" : resetLabel(usage.weekly)}`}
      />
    </>
  );
}

/**
 * ### StatusBar
 *
 * Bottom bar: Claude and Codex subscription limits, CPU, memory, the
 * notification switch, and a clock. Limits come from each provider's last
 * run, so they update whenever an agent works; ↻ asks Claude directly.
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
  const [now, setNow] = useState(0);

  const load = useCallback(async (probe: boolean) => {
    const response = await fetch("/api/usage", { method: probe ? "POST" : "GET" });
    // Trusted: produced by our own /api/usage route.
    if (response.ok) setUsage((await response.json()) as UsageSnapshot);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    // Deferred a tick: `load` sets state, which must not happen synchronously in an effect.
    const first = setTimeout(() => void load(false), 0);
    const timer = setInterval(() => void load(false), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  return (
    <footer className="flex items-center gap-x-3 overflow-hidden border-t border-zinc-200 px-3 py-1.5 text-[11px] whitespace-nowrap sm:gap-x-4 sm:px-4 dark:border-zinc-800">
      <ProviderMeters name="Claude" usage={usage?.claude} now={now} />
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
      <ProviderMeters name="Codex" usage={usage?.codex} now={now} />
      <span className="ml-auto flex items-center gap-4">
        <Meter className="hidden md:flex" label="CPU" percent={usage?.cpuPercent} stale={false} title="Average CPU usage over the last 30 seconds" />
        <Meter className="hidden md:flex" label="MEM" percent={usage?.memoryPercent} stale={false} title="Memory usage (excluding cache)" />
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
        <span className="hidden font-mono tabular-nums text-zinc-500 sm:inline">
          {now > 0 && new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </span>
      </span>
    </footer>
  );
}
