"use client";

import { CheckCircle2, CircleDot, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Loader, CircleMinus, XCircle } from "lucide-react";
import type { CheckOutcome, ChecksSummary } from "@/features/github/model/GitHub";

/**
 * ### PrStateIcon
 *
 * Pull request icon colored by state: open, draft, merged, or closed.
 */
export function PrStateIcon({ state, isDraft, size = 14 }: { state: string; isDraft: boolean; size?: number }) {
  if (state === "MERGED") return <GitMerge size={size} className="shrink-0 text-purple-600 dark:text-purple-400" aria-label="Merged" />;
  if (state === "CLOSED") return <GitPullRequestClosed size={size} className="shrink-0 text-red-600 dark:text-red-400" aria-label="Closed" />;
  if (isDraft) return <GitPullRequestDraft size={size} className="shrink-0 text-zinc-500" aria-label="Draft" />;
  return <GitPullRequest size={size} className="shrink-0 text-green-600 dark:text-green-400" aria-label="Open" />;
}

/**
 * ### IssueIcon
 *
 * Open issue icon.
 */
export function IssueIcon({ size = 14 }: { size?: number }) {
  return <CircleDot size={size} className="shrink-0 text-green-600 dark:text-green-400" aria-label="Open issue" />;
}

/**
 * ### OutcomeIcon
 *
 * Status icon for a check or a workflow run.
 */
export function OutcomeIcon({ outcome, size = 14 }: { outcome: CheckOutcome; size?: number }) {
  switch (outcome) {
    case "success":
      return <CheckCircle2 size={size} className="shrink-0 text-green-600 dark:text-green-400" aria-label="Passed" />;
    case "failure":
      return <XCircle size={size} className="shrink-0 text-red-600 dark:text-red-400" aria-label="Failed" />;
    case "pending":
      return <Loader size={size} className="shrink-0 animate-spin text-amber-500 [animation-duration:2s]" aria-label="Running" />;
    case "neutral":
      return <CircleMinus size={size} className="shrink-0 text-zinc-400 dark:text-zinc-500" aria-label="Skipped or cancelled" />;
  }
}

/**
 * ### runOutcome
 *
 * @param status - A workflow run's `status` (`completed`, `in_progress`, …).
 * @param conclusion - Its `conclusion` once completed.
 * @returns The run reduced to a {@link CheckOutcome}.
 */
export function runOutcome(status: string, conclusion: string | undefined): CheckOutcome {
  if (status !== "completed") return "pending";
  if (conclusion === "success") return "success";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure" || conclusion === "action_required") return "failure";
  return "neutral";
}

const DOT: Record<NonNullable<ChecksSummary["state"]>, string> = {
  success: "bg-green-500",
  failure: "bg-red-500",
  pending: "bg-amber-400 animate-pulse",
};

/**
 * ### ChecksDot
 *
 * Small dot summarizing a pull request's checks; nothing when it has none.
 */
export function ChecksDot({ checks }: { checks: ChecksSummary }) {
  if (checks.state === undefined) return undefined;
  const label =
    checks.state === "failure"
      ? `${checks.failed} of ${checks.total} checks failed`
      : checks.state === "pending"
        ? `${checks.pending} of ${checks.total} checks running`
        : `${checks.passed} of ${checks.total} checks passed`;
  return <span className={`size-2 shrink-0 rounded-full ${DOT[checks.state]}`} title={label} aria-label={label} />;
}
