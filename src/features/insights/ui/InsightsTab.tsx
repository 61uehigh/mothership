"use client";

import { useState } from "react";
import { useCommandList } from "@/shell/commands/commandContext";
import { sectionLabel as sectionName } from "@/shell/sections";
import { isSectionId, SECTIONS, type TabKind } from "@/shell/tabs";
import { useFormat } from "@/ui/i18n/format";
import type { MessageKey } from "@/ui/i18n/messages";
import { storedLabel, type Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { useJson } from "@/ui/useJson";
import type { EntryPath, FeatureStats, UsageStats } from "@/features/insights/model/Insights";
import { addDays, localDay } from "@/lib/dates";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";
import { SegmentedControl, type SegmentOption } from "@/ui/SegmentedControl";
import { Message } from "@/ui/Message";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
// "7d" in a very narrow tab, so the switch fits beside the title.
const rangeOptions = (t: Translate): ReadonlyArray<SegmentOption<string>> =>
  RANGES.map((range) => ({
    value: String(range),
    label: (
      <>
        <span className="@max-xs:hidden">{t("insights.range.long", { count: range })}</span>
        <span className="@xs:hidden">{t("insights.range.short", { count: range })}</span>
      </>
    ),
  }));

/** What each kind of tab is called here; a new kind must be named, or this does not compile. */
const KIND_LABEL = {
  session: "insights.kind.session",
  changes: "insights.kind.changes",
  compare: "insights.kind.compare",
  graph: "insights.kind.graph",
  inbox: "insights.kind.inbox",
  file: "insights.kind.file",
  pr: "insights.kind.pr",
  doc: "insights.kind.doc",
  meeting: "insights.kind.meeting",
  todo: "insights.kind.todo",
  notion: "insights.kind.notion",
  issue: "insights.kind.issue",
  slack: "insights.kind.slack",
  event: "insights.kind.event",
  mail: "insights.kind.mail",
  calendar: "insights.kind.calendar",
  daily: "insights.kind.daily",
  settings: "insights.kind.settings",
  "agent-limits": "insights.kind.agentLimits",
  system: "insights.kind.system",
  insights: "insights.kind.insights",
  debug: "insights.kind.debug",
  container: "insights.kind.container",
} as const satisfies Record<Exclude<TabKind, "section">, MessageKey>;

const VIA_LABEL = {
  sidebar: "insights.via.sidebar",
  tab: "insights.via.tab",
  titlebar: "insights.via.titlebar",
  statusbar: "insights.via.statusbar",
  palette: "insights.via.palette",
  shortcut: "insights.via.shortcut",
  notification: "insights.via.notification",
  link: "insights.via.link",
  other: "insights.via.other",
} as const satisfies Record<EntryPath, MessageKey>;

const isKind = (id: string): id is keyof typeof KIND_LABEL => id in KIND_LABEL;

function sectionLabel(t: Translate, id: string): string {
  return isSectionId(id) ? sectionName(t, id) : id;
}

function kindLabel(t: Translate, id: string): string {
  if (id.startsWith("section:")) return t("insights.area.fullView", { name: sectionLabel(t, id.slice("section:".length)) });
  return isKind(id) ? t(KIND_LABEL[id]) : id;
}

function areaLabel(t: Translate, area: string): string {
  const [prefix, ...rest] = area.split(":");
  const name = rest.join(":");
  switch (prefix) {
    case "sidebar":
      return t("insights.area.sidebar", { name: sectionLabel(t, name) });
    case "tab":
      return t("insights.area.tab", { name: kindLabel(t, name) });
    case "details":
      return t("insights.area.details", { name: kindLabel(t, name) });
    case "tabs":
      return t("insights.area.tabStrip");
    case "titlebar":
      return t("insights.area.titleBar");
    case "statusbar":
      return t("insights.area.statusBar");
    default:
      return t("insights.area.elsewhere");
  }
}

function duration(t: Translate, seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t("insights.duration.under");
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? t("insights.duration.minutes", { minutes }) : t("insights.duration.hours", { hours, minutes: String(minutes % 60).padStart(2, "0") });
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-xl font-semibold whitespace-nowrap tabular-nums @max-xs:text-lg">{value}</span>
      {hint !== undefined && <span className="text-[11px] text-zinc-500">{hint}</span>}
    </div>
  );
}

/** One row of a horizontal bar list: label, a bar scaled to the largest value, and the value. */
function BarRow({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-xs">
      <span className="truncate" title={label}>
        {label}
      </span>
      <span className="h-2.5 rounded-sm bg-zinc-100 dark:bg-zinc-900">
        <span className="block h-full rounded-sm bg-teal-600 dark:bg-teal-500" style={{ width: `${max === 0 ? 0 : Math.max(2, (value / max) * 100)}%` }} />
      </span>
      <span className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{text}</span>
    </li>
  );
}

function DailyChart({ days }: { days: Array<{ day: string; seconds: number }> }) {
  const t = useT();
  const max = Math.max(...days.map((d) => d.seconds), 0);
  return (
    <figure className="flex flex-col gap-1">
      <div className="flex h-32 items-end gap-0.5 border-b border-zinc-200 dark:border-zinc-800" role="img" aria-label={t("insights.perDayChart")}>
        {days.map((d) => (
          // The column is the hover target, so a zero day still shows its date.
          <div key={d.day} className="group flex h-full min-w-0 flex-1 items-end" title={`${d.day} · ${duration(t, d.seconds)}`}>
            <div
              className="w-full rounded-t-[4px] bg-teal-600 group-hover:bg-teal-500 dark:bg-teal-500 dark:group-hover:bg-teal-400"
              style={{ height: `${max === 0 || d.seconds === 0 ? 0 : Math.max(3, (d.seconds / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="flex justify-between text-[11px] text-zinc-500">
        <span>{days[0]?.day}</span>
        <span>{t("insights.peak", { duration: duration(t, max) })}</span>
        <span>{days.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

function ViaChips({ via }: { via: FeatureStats["via"] }) {
  const t = useT();
  return (
    <span className="flex flex-wrap gap-1">
      {Object.entries(via)
        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
        .map(([path, count]) => (
          <span key={path} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {t(VIA_LABEL[path as EntryPath])} {count}
          </span>
        ))}
    </span>
  );
}

/**
 * ### InsightsTab
 *
 * How you use mothership, from what this computer recorded: active time (window
 * in front, input within the last minute) per day and per area, each
 * feature's uses and how you reached it, and the features you have not used
 * in the period. Nothing here leaves this computer.
 */
export function InsightsTab() {
  const t = useT();
  const [days, setDays] = useState<Range>(30);
  // Fixed when the tab opens, so renders agree on what "today" is.
  const [today] = useState(() => Date.now());
  const since = addDays(localDay(today), -(days - 1));
  // The last period stays on screen while another loads, so the page and the period switch never blank out.
  const { data, error, loading, reload } = useJson<UsageStats>(`/api/insights?since=${since}`, { keepPrevious: true, remember: true });
  // The period `data` covers: it lags `days` while another period loads, so labels and the chart match the numbers.
  const [shownDays, setShownDays] = useState(days);
  if (!loading && data !== undefined && shownDays !== days) setShownDays(days);

  return (
    // Laid out by the tab's own width, like Settings.
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 @max-md:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">{t("insights.title")}</h1>
            <p className="text-xs text-zinc-500">{t("insights.intro")}</p>
          </div>
          <SegmentedControl
            label={t("insights.period")}
            value={String(days)}
            options={rangeOptions(t)}
            onChange={(value) => setDays(Number(value) as Range)}
            className="flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800/60"
            optionClassName={(selected) => `whitespace-nowrap rounded px-2.5 py-1 text-xs ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`}
          />
        </div>

        {data !== undefined ? (
          <div aria-busy={loading} className={`flex flex-col gap-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
            <InsightsBody data={data} days={shownDays} today={today} />
          </div>
        ) : error !== undefined ? (
          <Message size="tab" tone="error" onRetry={reload}>
            {error}
          </Message>
        ) : (
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4" aria-label={t("insights.loading")} role="status">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-[91px] animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Everything under the header, for one loaded period. */
function InsightsBody({ data, days, today }: { data: UsageStats; days: Range; today: number }) {
  const t = useT();
  const { relativeTime } = useFormat();
  const commands = useCommandList();
  const commandTitle = new Map(commands.map((c) => [c.id, c.title]));
  const featureLabel = (f: Pick<FeatureStats, "kind" | "feature">) =>
    f.kind === "open" ? kindLabel(t, f.feature) : f.kind === "command" ? (commandTitle.get(f.feature) ?? f.feature) : t("insights.button", { name: storedLabel(t, f.feature) });

  // Every day in the range, with the days you did not use the app at zero.
  const recorded = new Map(data.byDay.map((d) => [d.day, d.seconds]));
  const allDays = Array.from({ length: days }, (_, i) => {
    const day = addDays(localDay(today), -(days - 1 - i));
    return { day, seconds: recorded.get(day) ?? 0 };
  });
  const daysUsed = data.byDay.filter((d) => d.seconds > 0).length;

  const opened = new Set(data.features.filter((f) => f.kind !== "action").map((f) => `${f.kind}:${f.feature}`));
  const unused = [
    ...Object.keys(KIND_LABEL).map((kind) => ({ kind: "open" as const, feature: kind })),
    ...SECTIONS.map((section) => ({ kind: "open" as const, feature: `section:${section}` })),
    ...commands.map((c) => ({ kind: "command" as const, feature: c.id })),
  ].filter((f) => !opened.has(`${f.kind}:${f.feature}`));

  const topFeatures = data.features.slice(0, 25);
  const maxCount = topFeatures[0]?.count ?? 0;
  const areas = data.byArea.slice(0, 10);

  return (
    <>
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <Tile label={t("insights.activeTime")} value={duration(t, data.activeSeconds)} hint={t("insights.lastDays", { days })} />
          <Tile label={t("insights.perDay")} value={daysUsed === 0 ? "–" : duration(t, data.activeSeconds / daysUsed)} />
          <Tile label={t("insights.daysUsed")} value={`${daysUsed} / ${days}`} />
          <Tile label={t("insights.featuresUsed")} value={String(opened.size)} hint={t("insights.notUsedCount", { count: unused.length })} />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("insights.perDayChart")}</h2>
          <DailyChart days={allDays} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("insights.whereTime")}</h2>
          {areas.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("insights.nothingYet")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {areas.map((a) => (
                <BarRow key={a.area} label={areaLabel(t, a.area)} value={a.seconds} max={areas[0]?.seconds ?? 0} text={duration(t, a.seconds)} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("insights.mostUsed")}</h2>
          {topFeatures.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("insights.nothingYet")}</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[11px] text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">{t("insights.col.feature")}</th>
                  <th className="w-40 py-1 font-normal">{t("insights.col.uses")}</th>
                  <th className="py-1 font-normal">{t("insights.col.via")}</th>
                  <th className="w-20 whitespace-nowrap py-1 text-right font-normal">{t("insights.col.last")}</th>
                </tr>
              </thead>
              <tbody>
                {topFeatures.map((f) => (
                  <tr key={`${f.kind}:${f.feature}`} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="py-1.5 pr-3">{featureLabel(f)}</td>
                    <td className="py-1.5 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 rounded-sm bg-zinc-100 dark:bg-zinc-900">
                          <span className="block h-full rounded-sm bg-teal-600 dark:bg-teal-500" style={{ width: `${maxCount === 0 ? 0 : (f.count / maxCount) * 100}%` }} />
                        </span>
                        <span className="w-8 text-right tabular-nums">{f.count}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <ViaChips via={f.via} />
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right text-zinc-500">{relativeTime(f.lastAt, today)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("insights.notUsed", { days })}</h2>
          <p className="text-xs text-zinc-500">{t("insights.notUsedHint")}</p>
          {unused.length === 0 ? (
            <p className="text-xs text-zinc-500">{t("insights.usedEverything")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {unused.map((f) => (
                <li key={`${f.kind}:${f.feature}`} className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  {featureLabel(f)}
                </li>
              ))}
            </ul>
          )}
        </section>
    </>
  );
}
