"use client";

import { useState } from "react";
import { useCommandList } from "@/shell/commands/CommandProvider";
import { SECTION_INFO } from "@/shell/sections";
import { SECTIONS, type SectionId, type TabKind } from "@/shell/tabs";
import { relativeTime } from "@/ui/format";
import { useJson } from "@/ui/useJson";
import { localDay, type EntryPath, type FeatureStats, type UsageStats } from "@/features/insights/model/Usage";

const RANGES = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What each kind of tab is called here; a new kind must be named, or this does not compile. */
const KIND_LABEL: Record<Exclude<TabKind, "section">, string> = {
  session: "Session",
  changes: "Changes review",
  compare: "Compare run",
  graph: "Team graph",
  inbox: "Agents' questions",
  file: "File",
  pr: "Pull request",
  doc: "Nuclino doc",
  meeting: "Meeting summary",
  notion: "Notion page",
  issue: "Linear issue",
  slack: "Slack thread",
  event: "Calendar event",
  calendar: "Calendar",
  settings: "Settings",
  insights: "Insights",
  debug: "Debug panel",
  container: "Docker container",
};

const VIA_LABEL: Record<EntryPath, string> = {
  sidebar: "Sidebar",
  tab: "Inside a tab",
  titlebar: "Title bar",
  statusbar: "Status bar",
  palette: "Command center",
  shortcut: "Shortcut",
  notification: "Notification",
  link: "Link",
  other: "Other",
};

const isSection = (id: string): id is SectionId => (SECTIONS as ReadonlyArray<string>).includes(id);
const isKind = (id: string): id is keyof typeof KIND_LABEL => id in KIND_LABEL;

function sectionLabel(id: string): string {
  return isSection(id) ? SECTION_INFO[id].label : id;
}

function kindLabel(id: string): string {
  if (id.startsWith("section:")) return `${sectionLabel(id.slice("section:".length))} (full view)`;
  return isKind(id) ? KIND_LABEL[id] : id;
}

function areaLabel(area: string): string {
  const [prefix, ...rest] = area.split(":");
  const name = rest.join(":");
  switch (prefix) {
    case "sidebar":
      return `${sectionLabel(name)} sidebar`;
    case "tab":
      return `${kindLabel(name)} tab`;
    case "details":
      return `${kindLabel(name)} details`;
    case "tabs":
      return "Tab strip";
    case "titlebar":
      return "Title bar";
    case "statusbar":
      return "Status bar";
    default:
      return "Elsewhere";
  }
}

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
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
  const max = Math.max(...days.map((d) => d.seconds), 0);
  return (
    <figure className="flex flex-col gap-1">
      <div className="flex h-32 items-end gap-0.5 border-b border-zinc-200 dark:border-zinc-800" role="img" aria-label="Active time per day">
        {days.map((d) => (
          // The column is the hover target, so a zero day still shows its date.
          <div key={d.day} className="group flex h-full min-w-0 flex-1 items-end" title={`${d.day} · ${duration(d.seconds)}`}>
            <div
              className="w-full rounded-t-[4px] bg-teal-600 group-hover:bg-teal-500 dark:bg-teal-500 dark:group-hover:bg-teal-400"
              style={{ height: `${max === 0 || d.seconds === 0 ? 0 : Math.max(3, (d.seconds / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <figcaption className="flex justify-between text-[11px] text-zinc-500">
        <span>{days[0]?.day}</span>
        <span>Peak {duration(max)}</span>
        <span>{days.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

function ViaChips({ via }: { via: FeatureStats["via"] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {Object.entries(via)
        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
        .map(([path, count]) => (
          <span key={path} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {VIA_LABEL[path as EntryPath]} {count}
          </span>
        ))}
    </span>
  );
}

/**
 * ### InsightsTab
 *
 * How you use mothership, from what this Mac recorded: active time (window
 * in front, input within the last minute) per day and per area, each
 * feature's uses and how you reached it, and the features you have not used
 * in the period. Nothing here leaves this Mac.
 */
export function InsightsTab() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  // Fixed when the tab opens, so renders agree on what "today" is.
  const [today] = useState(() => Date.now());
  const since = localDay(today - (days - 1) * DAY_MS);
  const { data, error } = useJson<UsageStats>(`/api/insights?since=${since}`);
  const commands = useCommandList();

  if (data === undefined) return <p className="p-6 text-sm text-zinc-500">{error ?? "Loading…"}</p>;

  const commandTitle = new Map(commands.map((c) => [c.id, c.title]));
  const featureLabel = (f: Pick<FeatureStats, "kind" | "feature">) =>
    f.kind === "open" ? kindLabel(f.feature) : f.kind === "command" ? (commandTitle.get(f.feature) ?? f.feature) : `“${f.feature}” button`;

  // Every day in the range, with the days you did not use the app at zero.
  const recorded = new Map(data.byDay.map((d) => [d.day, d.seconds]));
  const allDays = Array.from({ length: days }, (_, i) => {
    const day = localDay(today - (days - 1 - i) * DAY_MS);
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
    // Laid out by the tab's own width, like Settings.
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 @max-md:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">Insights</h1>
            <p className="text-xs text-zinc-500">How you use mothership, recorded on this Mac only. Active time counts while the window is in front and you used it in the last minute.</p>
          </div>
          <div role="group" aria-label="Period" className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                aria-pressed={range === days}
                onClick={() => setDays(range)}
                className={`rounded px-2.5 py-1 text-xs ${range === days ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                {range} days
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <Tile label="Active time" value={duration(data.activeSeconds)} hint={`last ${days} days`} />
          <Tile label="Per day used" value={daysUsed === 0 ? "–" : duration(data.activeSeconds / daysUsed)} />
          <Tile label="Days used" value={`${daysUsed} / ${days}`} />
          <Tile label="Features used" value={String(opened.size)} hint={`${unused.length} not used`} />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Active time per day</h2>
          <DailyChart days={allDays} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Where the time went</h2>
          {areas.length === 0 ? (
            <p className="text-xs text-zinc-500">Nothing recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {areas.map((a) => (
                <BarRow key={a.area} label={areaLabel(a.area)} value={a.seconds} max={areas[0]?.seconds ?? 0} text={duration(a.seconds)} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Most used</h2>
          {topFeatures.length === 0 ? (
            <p className="text-xs text-zinc-500">Nothing recorded yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[11px] text-zinc-500">
                <tr>
                  <th className="py-1 font-normal">Feature</th>
                  <th className="w-40 py-1 font-normal">Uses</th>
                  <th className="py-1 font-normal">How you got there</th>
                  <th className="w-20 py-1 text-right font-normal">Last</th>
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
                    <td className="py-1.5 text-right text-zinc-500">{relativeTime(f.lastAt, today)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Not used in the last {days} days</h2>
          <p className="text-xs text-zinc-500">Candidates to improve, move somewhere easier to reach, or remove.</p>
          {unused.length === 0 ? (
            <p className="text-xs text-zinc-500">You used everything.</p>
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
      </div>
    </div>
  );
}
