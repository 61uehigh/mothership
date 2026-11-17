"use client";

import { PageSection } from "@/ui/PageSection";
import { Message } from "@/ui/Message";
import type { ReactNode } from "react";
import type { MemoryPressure, SystemSnapshot } from "@/features/usage/model/System";
import { formatBytes } from "@/ui/format";
import { useFormat } from "@/ui/i18n/format";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { MeterBar, MeterPercent, METER_TEXT_COLOR } from "@/ui/meter";
import { usePageVisible } from "@/ui/usePageVisible";
import { useJson } from "@/ui/useJson";

/** CPU and memory move quickly; this keeps the page live without much cost (the server caches 2 seconds). */
const POLL_MS = 5_000;

/** A battery this low takes the meter's warning and danger colors. */
const LOW_BATTERY = { warning: 20, danger: 10 };

const PRESSURE: Record<MemoryPressure, { label: "settings.system.pressureNormal" | "settings.system.pressureWarning" | "settings.system.pressureCritical"; color: string }> = {
  normal: { label: "settings.system.pressureNormal", color: METER_TEXT_COLOR.ok },
  warning: { label: "settings.system.pressureWarning", color: METER_TEXT_COLOR.warning },
  critical: { label: "settings.system.pressureCritical", color: METER_TEXT_COLOR.danger },
};

/** macOS's battery words (`pmset`) in the chosen language; others show as macOS gives them. */
function batteryWords(t: Translate, words: string): string {
  switch (words) {
    case "charging":
      return t("settings.system.charging");
    case "discharging":
      return t("settings.system.discharging");
    case "charged":
      return t("settings.system.charged");
    case "AC attached":
      return t("settings.system.acAttached");
    case "finishing charge":
      return t("settings.system.finishingCharge");
    case "AC Power":
      return t("settings.system.acPower");
    case "Battery Power":
      return t("settings.system.batteryPower");
    default:
      return words;
  }
}

function percentOf(part: number, total: number): number {
  return total <= 0 ? 0 : Math.round((part / total) * 100);
}

function Card({ title, percent, summary, children }: { title: string; percent?: number; summary?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-baseline gap-3">
        <p className="text-sm">{title}</p>
        {summary !== undefined && <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{summary}</span>}
        {percent !== undefined && <MeterPercent percent={percent} className="ml-auto text-xs" />}
      </div>
      {percent !== undefined && <MeterBar percent={percent} className="h-2 w-full" />}
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: Array<[string, ReactNode] | false> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows
        .filter((row): row is [string, ReactNode] => row !== false)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="min-w-0 break-words tabular-nums">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * ### SystemTab
 *
 * Standalone detail tab for this computer and the mothership process.
 * Samples resource usage every five seconds while visible.
 */
export function SystemTab() {
  const t = useT();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        <PageSection title={t("tab.system")} description={t("settings.system.description")}>
          <SystemDetails />
        </PageSection>
      </div>
    </div>
  );
}

function SystemDetails() {
  const t = useT();
  const format = useFormat();
  const visible = usePageVisible();
  const { data: system, error, reload } = useJson<SystemSnapshot>("/api/usage/system", { pollMs: visible ? POLL_MS : undefined });

  if (system === undefined) {
    return (
      <Message tone={error === undefined ? "muted" : "error"} onRetry={error === undefined ? undefined : reload}>
        {error ?? t("settings.system.reading")}
      </Message>
    );
  }
  const { memory, disk, battery, cpu } = system;
  const memoryPercent = percentOf(memory.used, memory.total);

  return (
    <div className="flex flex-col gap-3">
      {error !== undefined && <Message tone="error" onRetry={reload}>{error}</Message>}
      <Card title={system.name} summary={[system.model, system.chip].filter(Boolean).join(" · ")}>
        <Facts
          rows={[
            system.model !== undefined && [t("settings.system.model"), `${system.model}${system.modelId === undefined ? "" : ` (${system.modelId})`}`],
            system.chip !== undefined && [t("settings.system.chip"), system.chip],
            [t("settings.system.os"), system.os],
            [t("settings.system.upFor"), format.duration(system.uptimeSeconds * 1000)],
          ]}
        />
      </Card>
      <Card title="CPU" percent={cpu.percent} summary={t("settings.system.cores", { count: cpu.cores })}>
        <Facts
          rows={[
            cpu.loadAverage !== undefined && [t("settings.system.loadAverage"), `${cpu.loadAverage.map((n) => n.toFixed(2)).join("  ")}  ${t("settings.system.loadWindows")}`],
          ]}
        />
      </Card>
      <Card title={t("settings.system.memory")} percent={memoryPercent} summary={t("settings.system.memoryUsed", { used: formatBytes(memory.used), total: formatBytes(memory.total) })}>
        <Facts
          rows={[
            memory.pressure !== undefined && [
              t("settings.system.pressure"),
              <span key="p" className={PRESSURE[memory.pressure].color}>
                {t(PRESSURE[memory.pressure].label)}
              </span>,
            ],
            memory.app !== undefined && [t("settings.system.appMemory"), formatBytes(memory.app)],
            memory.wired !== undefined && [t("settings.system.wired"), formatBytes(memory.wired)],
            memory.compressed !== undefined && [t("settings.system.compressed"), formatBytes(memory.compressed)],
            memory.cached !== undefined && [t("settings.system.cache"), t("settings.system.cacheValue", { size: formatBytes(memory.cached) })],
            memory.swap !== undefined && [
              t("settings.system.swap"),
              memory.swap.total === 0 ? t("settings.system.none") : t("settings.system.of", { part: formatBytes(memory.swap.used), total: formatBytes(memory.swap.total) }),
            ],
          ]}
        />
      </Card>
      {disk !== undefined && (
        <Card title={t("settings.system.disk")} percent={percentOf(disk.used, disk.total)} summary={t("settings.system.diskFree", { free: formatBytes(disk.free), total: formatBytes(disk.total) })}>
          <Facts
            rows={[
              [t("settings.system.used"), formatBytes(disk.used)],
              [t("settings.system.volume"), disk.path],
            ]}
          />
        </Card>
      )}
      {battery !== undefined && (
        <Card title={t("settings.system.battery")} summary={`${battery.percent}% · ${batteryWords(t, battery.state)}`}>
          <MeterBar percent={battery.percent} className="h-2 w-full" level={battery.percent <= LOW_BATTERY.danger ? "danger" : battery.percent <= LOW_BATTERY.warning ? "warning" : "ok"} />
          <Facts
            rows={[
              battery.source !== undefined && [t("settings.system.power"), batteryWords(t, battery.source)],
              battery.minutesRemaining !== undefined && [
                battery.state === "charging" ? t("settings.system.untilFull") : t("settings.system.remaining"),
                format.duration(battery.minutesRemaining * 60_000),
              ],
            ]}
          />
        </Card>
      )}
      <Card title="mothership" summary={t("settings.system.serverProcess")}>
        <Facts
          rows={[
            [t("settings.system.memory"), t("settings.system.processMemory", { rss: formatBytes(system.process.rss), heap: formatBytes(system.process.heapUsed) })],
            [t("settings.system.runningFor"), format.duration(system.process.uptimeSeconds * 1000)],
          ]}
        />
      </Card>
      <p className="text-[11px] text-zinc-500">{t("settings.system.footnote")}</p>
    </div>
  );
}
