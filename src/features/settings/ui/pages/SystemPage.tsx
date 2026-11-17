"use client";

import { SettingsSection } from "@/features/settings/ui/settingsLayout";
import { Message } from "@/ui/Message";
import type { ReactNode } from "react";
import type { MemoryPressure, SystemSnapshot } from "@/features/usage/model/System";
import { formatBytes, formatDuration } from "@/ui/format";
import { MeterBar, MeterPercent, METER_TEXT_COLOR } from "@/ui/meter";
import { usePageVisible } from "@/ui/usePageVisible";
import { useJson } from "@/ui/useJson";

/** CPU and memory move quickly; this keeps the page live without much cost (the server caches 2 seconds). */
const POLL_MS = 5_000;

/** A battery this low takes the meter's warning and danger colors. */
const LOW_BATTERY = { warning: 20, danger: 10 };

const PRESSURE: Record<MemoryPressure, { label: string; color: string }> = {
  normal: { label: "Normal", color: METER_TEXT_COLOR.ok },
  warning: { label: "Warning: macOS is compressing and swapping more", color: METER_TEXT_COLOR.warning },
  critical: { label: "Critical: apps may slow down or be asked to quit", color: METER_TEXT_COLOR.danger },
};

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
 * ### SystemPage
 *
 * Standalone detail tab for this Mac and the mothership process.
 * Samples resource usage every five seconds while visible.
 */
export function SystemPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        <SettingsSection title="This Mac" description="CPU, memory, disk, battery, and the mothership process.">
          <SystemDetails />
        </SettingsSection>
      </div>
    </div>
  );
}

function SystemDetails() {
  const visible = usePageVisible();
  const { data: system, error, reload } = useJson<SystemSnapshot>("/api/usage/system", { pollMs: visible ? POLL_MS : undefined });

  if (system === undefined) {
    return (
      <Message tone={error === undefined ? "muted" : "error"} onRetry={error === undefined ? undefined : reload}>
        {error ?? "Reading this Mac…"}
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
            system.model !== undefined && ["Model", `${system.model}${system.modelId === undefined ? "" : ` (${system.modelId})`}`],
            system.chip !== undefined && ["Chip", system.chip],
            ["System", system.os],
            ["Up for", formatDuration(system.uptimeSeconds * 1000)],
          ]}
        />
      </Card>
      <Card title="CPU" percent={cpu.percent} summary={`${cpu.cores} cores`}>
        <Facts
          rows={[
            ["Load average", cpu.loadAverage.map((n) => n.toFixed(2)).join("  ") + "  (1, 5, 15 min)"],
          ]}
        />
      </Card>
      <Card title="Memory" percent={memoryPercent} summary={`${formatBytes(memory.used)} of ${formatBytes(memory.total)} used`}>
        <Facts
          rows={[
            memory.pressure !== undefined && ["Pressure", <span key="p" className={PRESSURE[memory.pressure].color}>{PRESSURE[memory.pressure].label}</span>],
            memory.app !== undefined && ["App memory", formatBytes(memory.app)],
            memory.wired !== undefined && ["Wired", formatBytes(memory.wired)],
            memory.compressed !== undefined && ["Compressed", formatBytes(memory.compressed)],
            memory.cached !== undefined && ["Cache", `${formatBytes(memory.cached)} (not counted as used; macOS frees it when needed)`],
            memory.swap !== undefined && ["Swap", memory.swap.total === 0 ? "None" : `${formatBytes(memory.swap.used)} of ${formatBytes(memory.swap.total)}`],
          ]}
        />
      </Card>
      {disk !== undefined && (
        <Card title="Disk" percent={percentOf(disk.used, disk.total)} summary={`${formatBytes(disk.free)} free of ${formatBytes(disk.total)}`}>
          <Facts
            rows={[
              ["Used", formatBytes(disk.used)],
              ["Volume", disk.path],
            ]}
          />
        </Card>
      )}
      {battery !== undefined && (
        <Card title="Battery" summary={`${battery.percent}% · ${battery.state}`}>
          <MeterBar percent={battery.percent} className="h-2 w-full" level={battery.percent <= LOW_BATTERY.danger ? "danger" : battery.percent <= LOW_BATTERY.warning ? "warning" : "ok"} />
          <Facts
            rows={[
              battery.source !== undefined && ["Power", battery.source],
              battery.minutesRemaining !== undefined && [
                battery.state === "charging" ? "Until full" : "Remaining",
                formatDuration(battery.minutesRemaining * 60_000),
              ],
            ]}
          />
        </Card>
      )}
      <Card title="mothership" summary="Its server process">
        <Facts
          rows={[
            ["Memory", `${formatBytes(system.process.rss)} (JavaScript heap ${formatBytes(system.process.heapUsed)})`],
            ["Running for", formatDuration(system.process.uptimeSeconds * 1000)],
          ]}
        />
      </Card>
      <p className="text-[11px] text-zinc-500">
        The status bar&apos;s CPU is the average over its last 30 seconds; here it is since the last refresh. Its MEM is the memory figure above,
        which leaves out cache.
      </p>
    </div>
  );
}
