"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import { DEFAULT_INBOX_RULES, INBOX_BUCKETS, type InboxBucket, type InboxRules } from "@/features/inbox/model/Inbox";
import { SETTINGS_BUTTON } from "@/features/settings/ui/settingsLayout";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";

type BucketRule = { [K in keyof InboxRules]: InboxRules[K] extends InboxBucket ? K : never }[keyof InboxRules];
const BUCKET_LABEL: Record<InboxBucket, string> = { today: "Today", week: "Week", month: "Month", hidden: "Off" };
const BUCKET_OPTIONS = INBOX_BUCKETS.map((value) => ({ value, label: BUCKET_LABEL[value] }));
const REVIEW_OPTIONS = [{ value: "on", label: "On" }, { value: "off", label: "Off" }] as const;
const TRACK = "inline-grid grid-flow-col auto-cols-fr items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70";
const segmentClass = (selected: boolean) =>
  `min-h-8 rounded-md px-2 text-xs focus-visible:outline-2 focus-visible:outline-teal-600 disabled:pointer-events-none pointer-coarse:min-h-11 ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`;

const THRESHOLDS = {
  slackRecentHours: { label: "Recent Slack DMs and mentions", unit: "hours", max: 24 * 30 },
  linearDueDays: { label: "Linear issues due soon", unit: "days", max: 60 },
  linearNotifyHours: { label: "Recent Linear notifications", unit: "hours", max: 24 * 30 },
} as const;
type Threshold = keyof typeof THRESHOLDS;

/**
 * ### InboxIntegration
 *
 * External services that supply items to Inbox rules.
 */
export type InboxIntegration = "github" | "slack" | "google_calendar" | "linear";

const GROUPS: Array<{
  title: string;
  integration?: InboxIntegration;
  thresholds?: Array<Threshold>;
  rows: Array<{ label: string; rule: BucketRule; hint?: string }>;
}> = [
  { title: "Agents", rows: [{ label: "Questions for you", rule: "agentQuestion" }] },
  {
    title: "GitHub",
    integration: "github",
    rows: [
      { label: "Pull requests waiting for your review", rule: "reviewRequest" },
      { label: "Your pull requests with failing checks", rule: "myPrFailing" },
      { label: "Your pull requests with changes requested", rule: "myPrChanges" },
      { label: "Your other open pull requests", rule: "myPr" },
      { label: "Issues assigned to you", rule: "githubIssue" },
    ],
  },
  {
    title: "Slack",
    integration: "slack",
    thresholds: ["slackRecentHours"],
    rows: [
      { label: "Recent direct messages", rule: "slackRecent" },
      { label: "Older direct messages", rule: "slackOlder" },
      { label: "Recent mentions of you", rule: "slackMentionRecent" },
      { label: "Older mentions of you", rule: "slackMentionOlder" },
      { label: "@here or @channel in your channels", rule: "slackGroupMention", hint: "Off also skips searching for these mentions." },
    ],
  },
  {
    title: "Calendar",
    integration: "google_calendar",
    rows: [
      { label: "Events today or in progress", rule: "calendarToday" },
      { label: "Events in the next 7 days", rule: "calendarWeek" },
      { label: "Invitations in the next 7 days you haven't answered or marked Maybe", rule: "calendarRsvp" },
    ],
  },
  {
    title: "Linear",
    integration: "linear",
    thresholds: ["linearDueDays", "linearNotifyHours"],
    rows: [
      { label: "Issues overdue, due today, or Urgent", rule: "linearUrgent" },
      { label: "Issues due soon or High priority", rule: "linearSoon" },
      { label: "Other issues", rule: "linearOther" },
      { label: "Recent notifications mentioning you or assigning you", rule: "linearNotifyDirect" },
      { label: "Other recent notifications", rule: "linearNotifyOther" },
      { label: "Older notifications", rule: "linearNotifyOlder" },
    ],
  },
];

/**
 * ### InboxRulesEditor
 *
 * Autosaves each sorting choice and shows pending choices immediately.
 * Failed changes fall back to the last saved values.
 *
 * Rules for disconnected services keep their saved choices and are excluded from resets.
 */
export function InboxRulesEditor({
  rules,
  disconnected,
  claudeReady,
  onSave,
}: {
  rules: InboxRules;
  disconnected: ReadonlySet<InboxIntegration>;
  claudeReady: boolean;
  onSave: (change: Partial<InboxRules>) => Promise<string | undefined>;
}) {
  const [draft, applyDraft] = useOptimistic(rules, (current, change: Partial<InboxRules>) => ({ ...current, ...change }));
  const [status, save, pending] = useActionState(
    async (_previous: { label: string; error: string | undefined } | undefined, update: { change: Partial<InboxRules>; label: string }) => {
      const error = await onSave(update.change);
      return { label: update.label, error };
    },
    undefined,
  );

  function changeRules(change: Partial<InboxRules>, label: string) {
    startTransition(() => {
      applyDraft(change);
      save({ change, label });
    });
  }

  function resetRules() {
    const defaults: Partial<InboxRules> = {};
    for (const { integration, rows, thresholds } of GROUPS) {
      if (integration !== undefined && disconnected.has(integration)) continue;
      for (const { rule } of rows) defaults[rule] = DEFAULT_INBOX_RULES[rule];
      for (const key of thresholds ?? []) defaults[key] = DEFAULT_INBOX_RULES[key];
    }
    if (claudeReady) defaults.claudeReview = DEFAULT_INBOX_RULES.claudeReview;
    changeRules(defaults, "Reset to defaults");
  }

  return (
    <div className="@container flex flex-col gap-5">
      {GROUPS.map(({ title, integration, rows, thresholds }) => {
        const disabled = integration !== undefined && disconnected.has(integration);
        return (
          <section key={title} aria-label={title} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold">{title}</h3>
              {disabled && <span className="text-xs text-zinc-600 dark:text-zinc-400">Disconnected · Manage in Connections</span>}
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map(({ label, rule, hint }) => (
                <li key={rule} className="flex flex-col items-start gap-2 px-3 py-2 @md:flex-row @md:items-center @md:justify-between">
                  <div className="text-sm">
                    {label}
                    {hint !== undefined && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
                  </div>
                  <SegmentedControl
                    label={`${title}: ${label}`}
                    options={BUCKET_OPTIONS}
                    value={draft[rule]}
                    disabled={disabled}
                    onChange={(choice) => {
                      if (choice !== draft[rule]) changeRules({ [rule]: choice }, label);
                    }}
                    activation="manual"
                    className={`${TRACK} w-full shrink-0 @md:w-52 ${disabled ? "opacity-60" : ""}`}
                    optionClassName={segmentClass}
                  />
                </li>
              ))}
            </ul>
            {thresholds !== undefined && (
              <div className="flex flex-col gap-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
                {thresholds.map((key) => {
                  const { label, unit, max } = THRESHOLDS[key];
                  return (
                    <label key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span>{label}</span>
                      <input
                        key={draft[key]}
                        aria-label={`${label} in ${unit}`}
                        type="number"
                        min={1}
                        max={max}
                        defaultValue={draft[key]}
                        disabled={disabled}
                        className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 disabled:opacity-60 dark:border-zinc-700"
                        onBlur={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          if (Number.isInteger(value) && value >= 1 && value <= max && value !== draft[key]) {
                            changeRules({ [key]: value }, label);
                          }
                          event.currentTarget.value = String(draft[key]);
                        }}
                      />
                      <span>{unit}</span>
                    </label>
                );
              })}
            </div>
          )}
        </section>
        );
      })}
      <section aria-label="Daily Claude review" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Daily Claude review</h3>
          <p className="mt-1 text-xs text-zinc-500">Claude can move misfiled items and explain why. Uses a small amount of Claude usage.</p>
          {!claudeReady && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Claude is disconnected · Manage in Agents</p>}
        </div>
        <SegmentedControl
          label="Daily Claude review"
          options={REVIEW_OPTIONS}
          value={draft.claudeReview ? "on" : "off"}
          disabled={!claudeReady}
          onChange={(choice) => {
            if ((choice === "on") !== draft.claudeReview) changeRules({ claudeReview: choice === "on" }, "Daily Claude review");
          }}
          activation="manual"
          className={`${TRACK} ${claudeReady ? "" : "opacity-60"}`}
          optionClassName={segmentClass}
        />
      </section>
      <div className="sticky bottom-0 -mx-1 flex min-h-10 flex-wrap items-center gap-3 bg-white px-1 py-2 dark:bg-zinc-950">
        <button type="button" className={SETTINGS_BUTTON} onClick={resetRules}>
          Reset to defaults
        </button>
        <span role="status" className={`text-xs ${status?.error === undefined ? "text-zinc-500" : "text-red-700 dark:text-red-400"}`}>
          {pending ? "Saving…" : status?.error === undefined ? (status === undefined ? "" : "Saved") : `${status.label}: ${status.error}`}
        </span>
      </div>
    </div>
  );
}
