"use client";

import { useState, type ReactNode } from "react";
import { DEFAULT_INBOX_RULES, INBOX_BUCKETS, type InboxBucket, type InboxRules } from "@/features/inbox/model/Inbox";

type BucketRule = { [K in keyof InboxRules]: InboxRules[K] extends InboxBucket ? K : never }[keyof InboxRules];

const BUCKET_LABEL: Record<InboxBucket, string> = { today: "Today", week: "This week", month: "This month", hidden: "Hide" };

const SELECT = "rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700";
const NUMBER = "w-14 rounded-md border border-zinc-300 bg-transparent px-1.5 py-0.5 text-xs dark:border-zinc-700";

/**
 * ### InboxRulesEditor
 *
 * Settings → Inbox: which bucket each kind of item goes to, the Slack age
 * and Linear due-date limits, and Claude's daily review. Each change saves
 * at once.
 *
 * @param onSave - Saves the changed rules; resolves with an error message, if any.
 */
export function InboxRulesEditor({ rules, onSave }: { rules: InboxRules; onSave: (change: Partial<InboxRules>) => Promise<string | undefined> }) {
  const [status, setStatus] = useState<{ message: string; failed: boolean } | undefined>(undefined);

  async function save(change: Partial<InboxRules>) {
    const error = await onSave(change);
    setStatus({ message: error ?? "Saved", failed: error !== undefined });
  }

  const bucket = (key: BucketRule) => (
    <select aria-label={key} className={SELECT} value={rules[key]} onChange={(e) => void save({ [key]: e.target.value as InboxBucket })}>
      {INBOX_BUCKETS.map((b) => (
        <option key={b} value={b}>
          {BUCKET_LABEL[b]}
        </option>
      ))}
    </select>
  );
  const number = (key: "slackRecentHours" | "linearDueDays", max: number) => (
    <input
      // Remounts when the saved value changes (a reset), since the field is not controlled.
      key={rules[key]}
      type="number"
      min={1}
      max={max}
      aria-label={key}
      className={NUMBER}
      defaultValue={rules[key]}
      // Saved when you leave the field, not on every keystroke.
      onBlur={(e) => {
        const value = Number(e.target.value);
        if (Number.isInteger(value) && value >= 1 && value <= max && value !== rules[key]) void save({ [key]: value });
      }}
    />
  );

  const rows: Array<{ label: ReactNode; control: ReactNode }> = [
    { label: "An agent's question to you", control: bucket("agentQuestion") },
    { label: "A pull request waiting for your review", control: bucket("reviewRequest") },
    { label: "Your pull request with failing checks", control: bucket("myPrFailing") },
    { label: "Your pull request with changes requested", control: bucket("myPrChanges") },
    { label: "Your other open pull requests", control: bucket("myPr") },
    { label: "A GitHub issue assigned to you", control: bucket("githubIssue") },
    { label: <>Slack mentions and DMs in the last {number("slackRecentHours", 24 * 30)} hours</>, control: bucket("slackRecent") },
    { label: "Older Slack mentions and DMs", control: bucket("slackOlder") },
    { label: "A Linear issue that is overdue, due today, or Urgent", control: bucket("linearUrgent") },
    { label: <>A Linear issue due within {number("linearDueDays", 60)} days, or High</>, control: bucket("linearSoon") },
    { label: "Every other Linear issue", control: bucket("linearOther") },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">{row.label}</span>
            {row.control}
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" checked={rules.claudeReview} onChange={(e) => void save({ claudeReview: e.target.checked })} />
        <span>
          Once a day, have Claude move items the rules seem to have sorted wrongly (Haiku; uses a little Claude usage). Moved items show a sparkle and why.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="button" className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => void save(DEFAULT_INBOX_RULES)}>
          Reset to defaults
        </button>
        {status !== undefined && (
          <span role="status" className={`text-xs ${status.failed ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
