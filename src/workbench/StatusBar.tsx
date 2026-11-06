"use client";

import { Bell, BellOff, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { NotificationState } from "@/features/notifications/model/NotificationState";
import { hasFiveHourLimit, isUsageStale, type ProviderUsage, type UsageSnapshot, type UsageWindow } from "@/features/usage/model/Usage";
import { openSettingsPage } from "@/shell/settingsPage";
import { useWorkbenchActions } from "@/shell/workbenchContext";
import { useFormat } from "@/ui/i18n/format";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { MeterBar, MeterPercent } from "@/ui/meter";
import { fetchJson } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import { useStoredState } from "@/ui/useStoredState";
import { usePageVisible } from "@/ui/usePageVisible";

const POLL_MS = 30_000;

/**
 * Whether Codex's last record had a 5-hour window, remembered so the bar
 * starts with the right meters instead of dropping one when numbers arrive.
 */
const CODEX_FIVE_HOUR_KEY = "mothership.status.codexFiveHour";
const parseBoolean = (raw: string) => (raw === "true" ? true : raw === "false" ? false : undefined);


function resetLabel(t: Translate, dateLocale: string, window: UsageWindow): string {
  if (window.resetsAt === undefined) return "";
  return t("status.resets", { time: new Date(window.resetsAt).toLocaleString(dateLocale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) });
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
  const t = useT();
  return (
    <button type="button" onClick={onOpen} className={`${className} items-center gap-1.5 rounded hover:text-zinc-900 dark:hover:text-zinc-100 ${stale ? "opacity-50" : ""}`} title={t("status.meterTitle", { title })}>
      <span className="text-zinc-500">{label}</span>
      <MeterBar percent={percent} className="h-1.5 w-8 sm:w-12" />
      <MeterPercent percent={percent} className="w-8 text-right" />
    </button>
  );
}

function ProviderMeters({
  name,
  usage,
  now,
  fiveHour,
  onOpen,
}: {
  name: string;
  usage: ProviderUsage | undefined;
  now: number;
  /** Show the 5-hour meter; `false` for a plan with only a weekly limit. */
  fiveHour: boolean;
  onOpen: () => void;
}) {
  // On phones only the 5-hour windows fit; weekly ones appear from the sm breakpoint,
  // unless the plan has no 5-hour limit, when the weekly meter takes its place.
  const t = useT();
  const { dateLocale } = useFormat();
  const stale = isUsageStale(usage, now);
  const observed = usage === undefined ? t("status.noRuns") : t("status.asOf", { time: new Date(usage.observedAt).toLocaleTimeString(dateLocale) });
  return (
    <>
      {fiveHour && (
        <Meter
          label={t("status.fiveHour", { name })}
          percent={usage?.fiveHour?.usedPercent}
          stale={stale}
          onOpen={onOpen}
          title={t("status.fiveHourTitle", { name, observed, reset: usage?.fiveHour === undefined ? "" : resetLabel(t, dateLocale, usage.fiveHour) })}
        />
      )}
      <Meter
        className={fiveHour ? "hidden sm:flex" : "flex"}
        label={t("status.weekly", { name })}
        percent={usage?.weekly?.usedPercent}
        stale={stale}
        onOpen={onOpen}
        title={t("status.weeklyTitle", { name, observed, reset: usage?.weekly === undefined ? "" : resetLabel(t, dateLocale, usage.weekly) })}
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
 * notification switch, and a clock. Limits update whenever an agent works;
 * the server also reads Claude's every few minutes while this polls, and ↻ asks Claude directly.
 * The limit meters open the Agent limits tab, CPU and memory the system tab,
 * and the clock Settings → General.
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
  const now = useNow(CLOCK_TICK_MS);
  const visible = usePageVisible();
  const workbench = useWorkbenchActions();
  const t = useT();
  const openAgentLimits = () => workbench.open({ kind: "agent-limits" });
  const openSystem = () => workbench.open({ kind: "system" });
  const [codexFiveHour, setCodexFiveHour] = useStoredState(CODEX_FIVE_HOUR_KEY, true, parseBoolean);

  const load = useCallback(async (probe: boolean) => {
    // A failed load (the server restarting, say) keeps the last numbers; the next poll tries again.
    const result = await fetchJson<UsageSnapshot>("/api/usage", { method: probe ? "POST" : "GET" });
    if (!result.ok) return;
    setUsage(result.data);
    setCodexFiveHour(hasFiveHourLimit(result.data.codex));
  }, [setCodexFiveHour]);

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
      <ProviderMeters name="Codex" usage={usage?.codex} now={now} fiveHour={codexFiveHour} onOpen={openAgentLimits} />
      {/* Codex first and Claude last, so the Claude-only refresh button sits next to Claude's meters. */}
      <ProviderMeters name="Claude" usage={usage?.claude} now={now} fiveHour onOpen={openAgentLimits} />
      <button
        type="button"
        disabled={probing}
        title={t("status.checkClaudeTitle")}
        className="-ml-1.5 text-zinc-500 hover:text-zinc-900 disabled:animate-spin sm:-ml-2.5 dark:hover:text-zinc-100"
        onClick={() => {
          setProbing(true);
          void load(true).finally(() => setProbing(false));
        }}
      >
        <RotateCw size={12} aria-label={t("status.checkClaude")} />
      </button>
      <span className="ml-auto flex shrink-0 items-center gap-4">
        <Meter className="hidden xl:flex" label="CPU" percent={usage?.cpuPercent} stale={false} onOpen={openSystem} title={t("status.cpuTitle")} />
        <Meter className="hidden xl:flex" label="MEM" percent={usage?.memoryPercent} stale={false} onOpen={openSystem} title={t("status.memTitle")} />
        {notifications !== "unsupported" && (
          <button
            type="button"
            onClick={onToggleNotifications}
            title={
              notifications === "granted"
                ? t("status.notificationsOnTitle")
                : notifications === "denied"
                  ? t("status.notificationsBlockedTitle")
                  : notifications === "muted"
                    ? t("status.notificationsMutedTitle")
                    : t("status.notificationsOffTitle")
            }
            aria-label={notifications === "granted" ? t("status.notificationsOn") : t("status.notificationsOff")}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {notifications === "granted" ? <Bell size={13} /> : <BellOff size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => openSettingsPage("general", () => workbench.open({ kind: "settings" }))}
          title={t("status.clockTitle")}
          className="hidden font-mono tabular-nums text-zinc-500 hover:text-zinc-900 sm:inline dark:hover:text-zinc-100"
        >
          {now > 0 && new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </button>
      </span>
    </footer>
  );
}
