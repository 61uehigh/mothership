"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import { DEFAULT_INBOX_RULES, INBOX_BUCKETS, INBOX_THRESHOLD_MAX, type InboxBucket, type InboxRules } from "@/features/inbox/model/Inbox";
import { SETTINGS_BUTTON } from "@/features/settings/ui/settingsLayout";
import type { Translate } from "@/ui/i18n/translate";
import { useT } from "@/ui/i18n/useT";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { SELECTED_SEGMENT, UNSELECTED_SEGMENT } from "@/ui/selection";

type BucketRule = { [K in keyof InboxRules]: InboxRules[K] extends InboxBucket ? K : never }[keyof InboxRules];
// Equal columns as wide as the longest label (`auto-cols-fr` would let a long label like "Needs you" spill into its neighbour).
const TRACK = "inline-grid grid-flow-col auto-cols-[1fr] items-center whitespace-nowrap gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70";
const segmentClass = (selected: boolean) =>
  `min-h-8 rounded-md px-2 text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-teal-600 disabled:pointer-events-none pointer-coarse:min-h-11 ${selected ? SELECTED_SEGMENT : UNSELECTED_SEGMENT}`;

type Threshold = keyof typeof INBOX_THRESHOLD_MAX;

/** A threshold's line and unit in the chosen language. */
function thresholdText(t: Translate, key: Threshold): { label: string; unit: string } {
  switch (key) {
    case "slackRecentHours":
      return { label: t("settings.inbox.slackRecentHours"), unit: t("settings.inbox.hours") };
    case "linearDueDays":
      return { label: t("settings.inbox.linearDueDays"), unit: t("settings.inbox.days") };
    case "linearNotifyHours":
      return { label: t("settings.inbox.linearNotifyHours"), unit: t("settings.inbox.hours") };
  }
}

/**
 * ### InboxIntegration
 *
 * External services that supply items to Inbox rules.
 */
export type InboxIntegration = "github" | "slack" | "google_calendar" | "linear" | "gmail";

type Group = {
  id: string;
  title: string;
  integration?: InboxIntegration;
  thresholds?: Array<Threshold>;
  rows: Array<{ label: string; rule: BucketRule; hint?: string }>;
};

const groups = (t: Translate): Array<Group> => [
  { id: "agents", title: t("settings.inbox.agents"), rows: [{ label: t("settings.inbox.agentQuestion"), rule: "agentQuestion" }] },
  {
    id: "slack",
    title: "Slack",
    integration: "slack",
    thresholds: ["slackRecentHours"],
    rows: [
      { label: t("settings.inbox.slackRecent"), rule: "slackRecent" },
      { label: t("settings.inbox.slackOlder"), rule: "slackOlder" },
      { label: t("settings.inbox.slackMentionRecent"), rule: "slackMentionRecent" },
      { label: t("settings.inbox.slackMentionOlder"), rule: "slackMentionOlder" },
      { label: t("settings.inbox.slackGroupMention"), rule: "slackGroupMention", hint: t("settings.inbox.slackGroupMentionHint") },
    ],
  },
  {
    id: "calendar",
    title: t("settings.inbox.calendar"),
    integration: "google_calendar",
    rows: [
      { label: t("settings.inbox.calendarToday"), rule: "calendarToday" },
      { label: t("settings.inbox.calendarWeek"), rule: "calendarWeek" },
      { label: t("settings.inbox.calendarRsvp"), rule: "calendarRsvp" },
    ],
  },
  {
    id: "linear",
    title: "Linear",
    integration: "linear",
    thresholds: ["linearDueDays", "linearNotifyHours"],
    rows: [
      { label: t("settings.inbox.linearUrgent"), rule: "linearUrgent" },
      { label: t("settings.inbox.linearSoon"), rule: "linearSoon" },
      { label: t("settings.inbox.linearOther"), rule: "linearOther" },
      { label: t("settings.inbox.linearNotifyDirect"), rule: "linearNotifyDirect" },
      { label: t("settings.inbox.linearNotifyOther"), rule: "linearNotifyOther" },
      { label: t("settings.inbox.linearNotifyOlder"), rule: "linearNotifyOlder" },
    ],
  },
  {
    id: "gmail",
    title: "Gmail",
    integration: "gmail",
    rows: [
      { label: t("settings.inbox.gmailImportant"), rule: "gmailImportant" },
      { label: t("settings.inbox.gmailUnread"), rule: "gmailUnread" },
    ],
  },
  // Last: only developers use GitHub.
  {
    id: "github",
    title: "GitHub",
    integration: "github",
    rows: [
      { label: t("settings.inbox.reviewRequest"), rule: "reviewRequest" },
      { label: t("settings.inbox.myPrFailing"), rule: "myPrFailing" },
      { label: t("settings.inbox.myPrChanges"), rule: "myPrChanges" },
      { label: t("settings.inbox.myPr"), rule: "myPr" },
      { label: t("settings.inbox.githubIssue"), rule: "githubIssue" },
    ],
  },
];

/**
 * ### InboxRulesEditor
 *
 * Autosaves each sorting choice and shows pending choices immediately.
 * Failed changes fall back to the last saved values.
 *
 * A service that is not connected shows a prompt to connect it instead of
 * its rules, which would do nothing yet; its saved choices are kept and
 * left out of resets.
 *
 * @param failing - Of `disconnected`, the ones that are set up but failing, so they read "Not working".
 * @param onConnect - Opens Settings → Connections at that service's card.
 */
export function InboxRulesEditor({
  rules,
  disconnected,
  failing,
  claudeReady,
  onSave,
  onConnect,
}: {
  rules: InboxRules;
  disconnected: ReadonlySet<InboxIntegration>;
  failing: ReadonlySet<InboxIntegration>;
  claudeReady: boolean;
  onSave: (change: Partial<InboxRules>) => Promise<string | undefined>;
  onConnect: (integration: InboxIntegration) => void;
}) {
  const t = useT();
  const GROUPS = groups(t);
  const BUCKET_LABEL: Record<InboxBucket, string> = {
    today: t("settings.inbox.bucketToday"),
    week: t("settings.inbox.bucketWeek"),
    month: t("settings.inbox.bucketMonth"),
    hidden: t("settings.inbox.bucketOff"),
  };
  const BUCKET_OPTIONS = INBOX_BUCKETS.map((value) => ({ value, label: BUCKET_LABEL[value] }));
  const REVIEW_OPTIONS = [
    { value: "on", label: t("settings.inbox.on") },
    { value: "off", label: t("settings.inbox.off") },
  ] as const;
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
    changeRules(defaults, t("settings.inbox.reset"));
  }

  return (
    <div className="@container flex flex-col gap-5">
      {GROUPS.map(({ id, title, integration, rows, thresholds }) => {
        const disabled = integration !== undefined && disconnected.has(integration);
        const broken = integration !== undefined && failing.has(integration);
        return (
          <section key={id} aria-label={title} className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold">{title}</h3>
              {disabled && <span className="text-xs text-zinc-600 dark:text-zinc-400">{broken ? t("settings.chip.notWorking") : t("settings.inbox.notConnected")}</span>}
            </div>
            {disabled ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                <p className="text-zinc-600 dark:text-zinc-400">
                  {broken ? t("settings.inbox.broken", { name: title }) : t("settings.inbox.connectFirst", { name: title })}
                </p>
                <button
                  type="button"
                  onClick={() => integration !== undefined && onConnect(integration)}
                  className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {broken ? t("settings.fixInConnections") : t("settings.inbox.openConnections")}
                </button>
              </div>
            ) : (
              <>
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
                        onChange={(choice) => {
                          if (choice !== draft[rule]) changeRules({ [rule]: choice }, label);
                        }}
                        activation="manual"
                        className={`${TRACK} w-full shrink-0 @md:w-auto`}
                        optionClassName={segmentClass}
                      />
                    </li>
                  ))}
                </ul>
                {thresholds !== undefined && (
                  <div className="flex flex-col gap-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
                    {thresholds.map((key) => {
                      const { label, unit } = thresholdText(t, key);
                      const max = INBOX_THRESHOLD_MAX[key];
                      return (
                        <label key={key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span>{label}</span>
                          <input
                            key={draft[key]}
                            aria-label={t("settings.inbox.thresholdIn", { label, unit })}
                            type="number"
                            min={1}
                            max={max}
                            defaultValue={draft[key]}
                            className="w-16 rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
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
              </>
            )}
          </section>
        );
      })}
      <section aria-label={t("settings.inbox.review")} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t("settings.inbox.review")}</h3>
          <p className="mt-1 text-xs text-zinc-500">{t("settings.inbox.reviewDescription")}</p>
          {!claudeReady && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t("settings.inbox.claudeDisconnected")}</p>}
        </div>
        <SegmentedControl
          label={t("settings.inbox.review")}
          options={REVIEW_OPTIONS}
          value={draft.claudeReview ? "on" : "off"}
          disabled={!claudeReady}
          onChange={(choice) => {
            if ((choice === "on") !== draft.claudeReview) changeRules({ claudeReview: choice === "on" }, t("settings.inbox.review"));
          }}
          activation="manual"
          className={`${TRACK} ${claudeReady ? "" : "opacity-60"}`}
          optionClassName={segmentClass}
        />
      </section>
      <div className="sticky bottom-0 -mx-1 flex min-h-10 flex-wrap items-center gap-3 bg-white px-1 py-2 dark:bg-zinc-950">
        <button type="button" className={SETTINGS_BUTTON} onClick={resetRules}>
          {t("settings.inbox.reset")}
        </button>
        <span role="status" className={`text-xs ${status?.error === undefined ? "text-zinc-500" : "text-red-700 dark:text-red-400"}`}>
          {pending ? t("settings.saving") : status?.error === undefined ? (status === undefined ? "" : t("settings.saved")) : `${status.label}: ${status.error}`}
        </span>
      </div>
    </div>
  );
}
