"use client";

import { RotateCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isUsageStale, windowsOf, type LimitWindow, type ProviderUsage, type UsageSnapshot } from "@/features/usage/model/Usage";
import type { CheckResult, SettingsView } from "@/features/settings/model/Settings";
import { SettingsSection } from "@/features/settings/ui/settingsLayout";
import { Message } from "@/ui/Message";
import { formatDuration, relativeTime } from "@/ui/format";
import { DANGER_PERCENT, MeterBar, MeterPercent, WARNING_PERCENT } from "@/ui/meter";
import { useNow } from "@/ui/useNow";
import { usePageVisible } from "@/ui/usePageVisible";
import { fetchJson, useJson } from "@/ui/useJson";

/** As often as the status bar asks. */
const POLL_MS = 30_000;

function when(epochMs: number): string {
  return new Date(epochMs).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function WindowRow({ window, now }: { window: LimitWindow; now: number }) {
  return (
    <li className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-x-3 gap-y-0.5 text-xs @max-md:grid-cols-[1fr_3.5rem]">
      <span className="text-zinc-700 dark:text-zinc-300">{window.label}</span>
      <MeterBar percent={window.usedPercent} className="h-2 w-full @max-md:col-span-2 @max-md:row-start-2" />
      <MeterPercent percent={window.usedPercent} className="text-right @max-md:row-start-1 @max-md:col-start-2" />
      <span className="col-start-2 text-[11px] text-zinc-500 @max-md:col-span-2 @max-md:col-start-1">
        {window.resetsAt === undefined
          ? "Reset time not reported"
          : window.resetsAt > now
            ? `Resets ${when(window.resetsAt)} (in ${formatDuration(window.resetsAt - now)})`
            : `Reset ${when(window.resetsAt)}; new numbers come with the next run`}
      </span>
    </li>
  );
}

function Provider({ name, usage, now, missing, action }: { name: string; usage: ProviderUsage | undefined; now: number; missing: ReactNode; action?: ReactNode }) {
  const stale = now > 0 && isUsageStale(usage, now);
  const windows = usage === undefined ? [] : windowsOf(usage);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">{name}</p>
          <p className="text-[11px] text-zinc-500">
            {usage === undefined
              ? "No numbers yet"
              : `Updated ${new Date(usage.observedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${now > 0 ? ` (${relativeTime(usage.observedAt, now)})` : ""}${stale ? " · stale, so dimmed" : ""}`}
          </p>
        </div>
        {action}
      </div>
      {windows.length > 0 ? (
        <ul className={`flex flex-col gap-2.5 ${stale ? "opacity-50" : ""}`}>
          {windows.map((window) => (
            <WindowRow key={window.id} window={window} now={now} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">{missing}</p>
      )}
    </div>
  );
}

/**
 * ### UsagePage
 *
 * Standalone detail tab for Claude and Codex subscription limits.
 * Loads account setup to explain which limits the providers can report.
 */
export function UsagePage() {
  const { data: view, error, reload } = useJson<SettingsView>("/api/settings", { remember: true });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        <SettingsSection title="Agent limits" description="Subscription usage and reset times for Claude and Codex.">
          {view === undefined ? (
            <Message tone={error === undefined ? "muted" : "error"} onRetry={error === undefined ? undefined : reload}>
              {error ?? "Checking your setup…"}
            </Message>
          ) : (
            <UsageDetails
              claude={view.agents.claude}
              codex={view.agents.codex}
              anthropicKey={view.agentSecrets.some((secret) => secret.name === "ANTHROPIC_API_KEY" && secret.set)}
            />
          )}
        </SettingsSection>
      </div>
    </div>
  );
}

function UsageDetails({ claude, codex, anthropicKey }: { claude: CheckResult; codex: CheckResult; anthropicKey: boolean }) {
  const visible = usePageVisible();
  const usage = useJson<UsageSnapshot>("/api/usage", { pollMs: visible ? POLL_MS : undefined });
  const now = useNow(POLL_MS);
  const [probe, setProbe] = useState<{ busy: boolean; error: string | undefined }>({ busy: false, error: undefined });

  async function checkNow() {
    setProbe({ busy: true, error: undefined });
    const result = await fetchJson<UsageSnapshot>("/api/usage", { method: "POST" });
    setProbe({ busy: false, error: result.ok ? undefined : result.error });
    usage.reload();
  }

  const claudeMissing = !claude.ready ? (
    <>Claude isn&apos;t set up ({claude.detail}). Log in under Agents; limits apply to claude.ai subscriptions.</>
  ) : anthropicKey ? (
    <>
      An Anthropic API key is saved, so runs bill the key and report no plan limits. Check now asks with your Claude login instead (one Haiku call,
      about $0.002).
    </>
  ) : (
    <>
      Shown after Claude runs once since mothership started (they&apos;re kept in memory), or check now: one Haiku call, about $0.002 of your
      usage.
    </>
  );
  const codexMissing = !codex.ready ? (
    <>Codex isn&apos;t set up ({codex.detail}). Log in under Agents.</>
  ) : (
    <>
      Codex writes its limits into its session log (~/.codex/sessions) when it runs with a ChatGPT login. None found yet: run Codex once. An
      API key reports no plan limits.
    </>
  );

  return (
    <div className="@container flex flex-col gap-3">
      {usage.error !== undefined && <Message tone="error" onRetry={usage.reload}>{usage.error}</Message>}
      <Provider
        name="Claude"
        usage={usage.data?.claude}
        now={now}
        missing={claudeMissing}
        action={
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={probe.busy}
              onClick={() => void checkNow()}
              title="One Haiku call, about $0.002 of Claude usage"
              className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <RotateCw size={12} aria-hidden className={probe.busy ? "animate-spin" : ""} />
              Check now
            </button>
            <span className="text-[11px] text-zinc-500">One Haiku call, about $0.002</span>
          </div>
        }
      />
      {probe.error !== undefined && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {probe.error}
        </p>
      )}
      <Provider name="Codex" usage={usage.data?.codex} now={now} missing={codexMissing} />
      <p className="text-[11px] text-zinc-500">
        Claude&apos;s numbers come with each Claude run (sessions and claude.ai connector calls); Codex&apos;s are read from its newest session log.
        Meters turn yellow from {WARNING_PERCENT}% and red from {DANGER_PERCENT}%. Numbers older than an hour are dimmed.
      </p>
    </div>
  );
}
