"use client";

import { RotateCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isUsageStale, planLabel, type LimitWindow, type ProviderUsage, type UsageSnapshot } from "@/features/usage/model/Usage";
import type { CheckResult, SettingsView } from "@/features/settings/model/Settings";
import { PageSection } from "@/ui/PageSection";
import { isClaudeLoginFailure } from "@/shell/claudeLogin";
import { ClaudeLoginNote } from "@/shell/ClaudeLoginNote";
import { Message } from "@/ui/Message";
import { useFormat } from "@/ui/i18n/format";
import { checkText } from "@/shell/checkText";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { DANGER_PERCENT, MeterBar, MeterPercent, WARNING_PERCENT } from "@/ui/meter";
import { useNow } from "@/ui/useNow";
import { usePageVisible } from "@/ui/usePageVisible";
import { type ApiFailure, fetchJson, useJson } from "@/ui/useJson";

/** As often as the status bar asks. */
const POLL_MS = 30_000;

function when(epochMs: number, locale: string): string {
  return new Date(epochMs).toLocaleString(locale, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const DAY_MINUTES = 24 * 60;

/** A window's length as a name: "5-hour", "Weekly", "Daily", or the length in hours or days. */
function lengthName(t: Translate, minutes: number): string {
  if (minutes === 7 * DAY_MINUTES) return t("settings.usage.weekly");
  if (minutes === DAY_MINUTES) return t("settings.usage.daily");
  if (minutes % DAY_MINUTES === 0) return t("settings.usage.days", { count: minutes / DAY_MINUTES });
  if (minutes % 60 === 0) return t("settings.usage.hours", { count: minutes / 60 });
  return t("settings.usage.minutes", { count: minutes });
}

/** A limit window's name in the chosen language, e.g. "Weekly (Opus)"; one the app does not know shows by its key. */
function windowName(t: Translate, window: LimitWindow): string {
  if (window.minutes === undefined) return window.id.replaceAll("_", " ");
  const name = lengthName(t, window.minutes);
  const qualifier = window.model ?? (window.scope === "apps" ? t("settings.usage.apps") : window.scope === "extra-usage" ? t("settings.usage.extraUsage") : undefined);
  return qualifier === undefined ? name : `${name} (${qualifier})`;
}

function WindowRow({ window, now }: { window: LimitWindow; now: number }) {
  const t = useT();
  const format = useFormat();
  return (
    <li className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-x-3 gap-y-0.5 text-xs @max-md:grid-cols-[1fr_3.5rem]">
      <span className="text-zinc-700 dark:text-zinc-300">{windowName(t, window)}</span>
      <MeterBar percent={window.usedPercent} className="h-2 w-full @max-md:col-span-2 @max-md:row-start-2" />
      <MeterPercent percent={window.usedPercent} className="text-right @max-md:row-start-1 @max-md:col-start-2" />
      <span className="col-start-2 text-[11px] text-zinc-500 @max-md:col-span-2 @max-md:col-start-1">
        {window.resetsAt === undefined
          ? t("settings.usage.resetUnknown")
          : window.resetsAt > now
            ? t("settings.usage.resets", { when: when(window.resetsAt, format.dateLocale), in: format.duration(window.resetsAt - now) })
            : t("settings.usage.wasReset", { when: when(window.resetsAt, format.dateLocale) })}
      </span>
    </li>
  );
}

/** Why Check now failed, in the chosen language; the codes come from the usage route. */
function ProbeFailure({ failure }: { failure: ApiFailure }) {
  const t = useT();
  if (isClaudeLoginFailure(failure)) return <ClaudeLoginNote error={t("settings.usage.probeLogin")} />;
  const text =
    failure.code === "claude-limit"
      ? t("settings.usage.probeLimit", { detail: failure.error })
      : failure.code === "probe-timeout"
        ? t("settings.usage.probeTimeout")
        : failure.code === "claude-no-limits"
          ? t("settings.usage.probeNoLimits")
          : t("settings.usage.probeFailed", { detail: failure.error });
  return (
    <p role="alert" className="break-words text-xs text-red-600 dark:text-red-400">
      {text}
    </p>
  );
}

function Provider({
  name,
  usage,
  now,
  missing,
  action,
  alert,
}: {
  name: string;
  usage: ProviderUsage | undefined;
  now: number;
  missing: ReactNode;
  action?: ReactNode;
  /** Shown in place of `missing`, or under the windows, e.g. why Check now failed. */
  alert?: ReactNode;
}) {
  const t = useT();
  const format = useFormat();
  const stale = now > 0 && isUsageStale(usage, now);
  const windows = usage?.windows ?? [];
  const plan = planLabel(usage?.plan);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            {name}
            {plan !== undefined && <span className="ml-2 text-xs text-zinc-500">{t("settings.usage.plan", { plan })}</span>}
          </p>
          <p className="text-[11px] text-zinc-500">
            {usage === undefined
              ? t("settings.usage.noNumbers")
              : `${t("settings.usage.updated", {
                  when: new Date(usage.observedAt).toLocaleString(format.dateLocale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                })}${now > 0 ? ` (${format.relativeTime(usage.observedAt, now)})` : ""}${stale ? ` · ${t("settings.usage.stale")}` : ""}`}
          </p>
        </div>
        {action}
      </div>
      {windows.length > 0 && (
        <ul className={`flex flex-col gap-2.5 ${stale ? "opacity-50" : ""}`}>
          {windows.map((window) => (
            <WindowRow key={window.id} window={window} now={now} />
          ))}
        </ul>
      )}
      {alert ?? (windows.length === 0 && <p className="text-xs text-zinc-500">{missing}</p>)}
    </div>
  );
}

/**
 * ### AgentLimitsTab
 *
 * Standalone detail tab for Claude and Codex subscription limits.
 * Loads account setup to explain which limits the providers can report.
 */
export function AgentLimitsTab() {
  const t = useT();
  const { data: view, error, reload } = useJson<SettingsView>("/api/settings", { remember: true });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-6">
        <PageSection title={t("tab.agentLimits")} description={t("settings.usage.description")}>
          {view === undefined ? (
            <Message tone={error === undefined ? "muted" : "error"} onRetry={error === undefined ? undefined : reload}>
              {error ?? t("settings.checking")}
            </Message>
          ) : (
            <UsageDetails
              claude={view.agents.claude}
              codex={view.agents.codex}
              anthropicKey={view.agentSecrets.some((secret) => secret.name === "ANTHROPIC_API_KEY" && secret.set)}
            />
          )}
        </PageSection>
      </div>
    </div>
  );
}

function UsageDetails({ claude, codex, anthropicKey }: { claude: CheckResult; codex: CheckResult; anthropicKey: boolean }) {
  const t = useT();
  const visible = usePageVisible();
  const usage = useJson<UsageSnapshot>("/api/usage", { pollMs: visible ? POLL_MS : undefined });
  const now = useNow(POLL_MS);
  const [probe, setProbe] = useState<{ busy: boolean; failure: ApiFailure | undefined }>({ busy: false, failure: undefined });

  async function checkNow() {
    setProbe({ busy: true, failure: undefined });
    const result = await fetchJson<UsageSnapshot>("/api/usage", { method: "POST" });
    setProbe({ busy: false, failure: result.ok ? undefined : result });
    usage.reload();
  }

  const claudeMissing = !claude.ready
    ? t("settings.usage.claudeNotSetUp", { detail: checkText(t, "claude", claude) })
    : anthropicKey
      ? t("settings.usage.claudeApiKey")
      : t("settings.usage.claudeNoNumbers");
  const codexMissing = !codex.ready ? t("settings.usage.codexNotSetUp", { detail: checkText(t, "codex", codex) }) : t("settings.usage.codexNoNumbers");

  return (
    <div className="@container flex flex-col gap-3">
      {usage.error !== undefined && <Message tone="error" onRetry={usage.reload}>{usage.error}</Message>}
      <Provider
        name="Claude"
        usage={usage.data?.claude}
        now={now}
        missing={claudeMissing}
        alert={probe.failure === undefined ? undefined : <ProbeFailure failure={probe.failure} />}
        action={
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={probe.busy}
              onClick={() => void checkNow()}
              title={t("settings.usage.checkNowTitle")}
              className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <RotateCw size={12} aria-hidden className={probe.busy ? "animate-spin" : ""} />
              {t("settings.usage.checkNow")}
            </button>
            <span className="text-[11px] text-zinc-500">{t("settings.usage.checkNowCost")}</span>
          </div>
        }
      />
      <Provider name="Codex" usage={usage.data?.codex} now={now} missing={codexMissing} />
      <p className="text-[11px] text-zinc-500">{t("settings.usage.footnote", { warning: WARNING_PERCENT, danger: DANGER_PERCENT })}</p>
    </div>
  );
}
