"use client";

import { ExternalLink, MessageSquareText, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useShell } from "@/shell/ShellContext";
import { useLocalRepos, usePullRequest } from "@/features/github/ui/api";
import { OutcomeIcon } from "@/features/github/ui/icons";
import { Message } from "@/ui/Message";
import type { Tab } from "@/shell/tabs";
import type { Check, CheckOutcome, PullRequest } from "@/features/github/model/GitHub";

const OUTCOME_ORDER: Record<CheckOutcome, number> = { failure: 0, pending: 1, success: 2, neutral: 3 };

const DECISION: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Approved", className: "text-green-700 dark:text-green-400" },
  CHANGES_REQUESTED: { label: "Changes requested", className: "text-red-700 dark:text-red-400" },
  REVIEW_REQUIRED: { label: "Review required", className: "text-amber-700 dark:text-amber-400" },
};

const MERGEABLE: Record<string, { label: string; className: string }> = {
  MERGEABLE: { label: "No conflicts with the base branch", className: "text-green-700 dark:text-green-400" },
  CONFLICTING: { label: "Has conflicts that must be resolved", className: "text-red-700 dark:text-red-400" },
};

const HUMAN_RULE =
  "Do not push, merge, or post anything on GitHub (comments, reviews, PRs) without asking me first via ask_human.";

function fixChecksMessage(pr: PullRequest, failing: Array<Check>): string {
  const list = failing.map((c) => `- ${c.workflowName === undefined ? c.name : `${c.workflowName} / ${c.name}`}: ${c.detailsUrl ?? "no link"}`);
  return [
    `Pull request ${pr.url} (${pr.repo}#${pr.number}, ${pr.headRefName} → ${pr.baseRefName}) has failing checks:`,
    list.join("\n"),
    `Inspect the failures with gh, for example \`gh pr checks ${pr.number} --repo ${pr.repo}\` and \`gh run view <run-id> --repo ${pr.repo} --log-failed\`, and find the root cause.`,
    `Then fix it on a branch based on the PR's head branch \`${pr.headRefName}\` (fetch it from origin into this worktree) and run the relevant tests locally.`,
    HUMAN_RULE,
    "When you are done, report what failed, what you changed, and how you verified it.",
  ].join("\n\n");
}

function reviewMessage(pr: PullRequest): string {
  return [
    `Please address the review comments on pull request ${pr.url} (${pr.repo}#${pr.number}, ${pr.headRefName} → ${pr.baseRefName}).`,
    `Read them with \`gh pr view ${pr.number} --repo ${pr.repo} --comments\`; inline review comments are at \`gh api repos/${pr.repo}/pulls/${pr.number}/comments\`.`,
    `Fix them on a branch based on the PR's head branch \`${pr.headRefName}\` (fetch it from origin into this worktree) and run the relevant tests.`,
    HUMAN_RULE,
    "Report back with each comment and how you addressed it, or why you did not.",
  ].join("\n\n");
}

/**
 * ### PrSide
 *
 * Details column beside a pull request tab: checks, review
 * decision, mergeability, and buttons that hand the pull request to a new
 * agent working in a worktree of the local checkout.
 */
export function PrSide({ tab }: { tab: Extract<Tab, { kind: "pr" }> }) {
  const { openNewAgent } = useShell();
  const { result, reload } = usePullRequest(tab.repo, tab.number);
  const repos = useLocalRepos();

  if (result === undefined) return <Message size="details">Loading…</Message>;
  if (!result.ok) {
    return (
      <Message size="details" tone="error" onRetry={reload}>
        {result.error}
      </Message>
    );
  }

  const pr = result.data;
  const checks = [...pr.checks].sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || a.name.localeCompare(b.name));
  const failing = checks.filter((c) => c.outcome === "failure");
  const hasReviewComments = pr.comments.length > 0 || pr.reviews.some((r) => r.body.trim() !== "" || r.reviewState === "CHANGES_REQUESTED");
  const localDir = repos.data?.repos.find((r) => r.repo === pr.repo)?.dir;
  const decision = pr.reviewDecision === undefined ? undefined : DECISION[pr.reviewDecision];
  const mergeable = MERGEABLE[pr.mergeable];
  const open = pr.state === "OPEN";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 text-xs">
      <Block title="Status">
        <dl className="flex flex-col gap-1">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-zinc-500">Review</dt>
            <dd className={decision?.className}>{decision?.label ?? (pr.reviewDecision === undefined ? "No review required" : pr.reviewDecision)}</dd>
          </div>
          {open && (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-zinc-500">Merge</dt>
              <dd className={mergeable?.className ?? "text-zinc-500"}>{mergeable?.label ?? "Mergeability not computed yet"}</dd>
            </div>
          )}
        </dl>
      </Block>

      <Block title={`Checks${checks.length > 0 ? ` (${checks.length})` : ""}`}>
        {checks.length === 0 && <p className="text-zinc-500">No checks reported.</p>}
        <ul className="flex flex-col">
          {checks.map((check, i) => (
            <li key={`${check.workflowName ?? ""}/${check.name}/${i}`}>
              <a
                href={check.detailsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={check.conclusion ?? check.status}
                className="flex items-center gap-2 rounded px-1 py-1 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
              >
                <OutcomeIcon outcome={check.outcome} size={13} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{check.name}</span>
                  {check.workflowName !== undefined && <span className="truncate text-[10px] text-zinc-500">{check.workflowName}</span>}
                </span>
                {check.detailsUrl !== undefined && <ExternalLink size={11} className="shrink-0 text-zinc-400" />}
              </a>
            </li>
          ))}
        </ul>
      </Block>

      {open && (failing.length > 0 || hasReviewComments) && (
        <Block title="Hand off to an agent">
          <div className="flex flex-col gap-2">
            {failing.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-zinc-300 px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() =>
                  openNewAgent({
                    name: `fix-checks-${pr.number}`,
                    role: "code_worker",
                    initialMessage: fixChecksMessage(pr, failing),
                    repo: localDir,
                    worktree: true,
                  })
                }
              >
                <Wrench size={13} className="shrink-0 text-red-600 dark:text-red-400" />
                Fix failing checks
              </button>
            )}
            {hasReviewComments && (
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-zinc-300 px-2.5 py-1.5 text-left hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                onClick={() =>
                  openNewAgent({
                    name: `address-review-${pr.number}`,
                    role: "code_worker",
                    initialMessage: reviewMessage(pr),
                    repo: localDir,
                    worktree: true,
                  })
                }
              >
                <MessageSquareText size={13} className="shrink-0 text-teal-600 dark:text-teal-400" />
                Address review comments
              </button>
            )}
            {repos.data !== undefined && localDir === undefined && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">No local checkout of {pr.repo} was found; choose its folder in the dialog.</p>
            )}
          </div>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}
