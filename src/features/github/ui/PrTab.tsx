"use client";

import { ExternalLink } from "lucide-react";
import { relativeTime } from "@/ui/format";
import { usePullRequest } from "@/features/github/ui/api";
import { PrStateIcon } from "@/features/github/ui/icons";
import { Markdown } from "@/shell/Markdown";
import { PrDiff } from "@/features/github/ui/PrDiff";
import { ICON_BUTTON_BASE, RefreshButton } from "@/ui/IconButton";
import { Message } from "@/ui/Message";
import { useText } from "@/ui/useJson";
import { useNow } from "@/ui/useNow";
import type { Tab } from "@/shell/tabs";
import type { PrComment, PullRequest } from "@/features/github/model/GitHub";

const CLOCK_TICK_MS = 30_000;

const REVIEW_LABEL: Record<string, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "requested changes",
  COMMENTED: "reviewed",
  DISMISSED: "review dismissed",
  PENDING: "pending review",
};

function stateBadge(pr: PullRequest): { label: string; className: string } {
  if (pr.state === "MERGED") return { label: "Merged", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" };
  if (pr.state === "CLOSED") return { label: "Closed", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
  if (pr.isDraft) return { label: "Draft", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" };
  return { label: "Open", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" };
}

/**
 * ### PrTab
 *
 * Center view of a pull request: header, description, changed files, and
 * conversation (comments and reviews, oldest first). Read-only.
 */
export function PrTab({ tab }: { tab: Extract<Tab, { kind: "pr" }> }) {
  const { result, loading, reload } = usePullRequest(tab.repo, tab.number);
  const diff = useText(`/api/github/pr/diff?repo=${encodeURIComponent(tab.repo)}&number=${tab.number}`);
  const now = useNow(CLOCK_TICK_MS);

  if (result === undefined) return <p className="p-6 text-sm text-zinc-500">Loading pull request…</p>;
  if (!result.ok) {
    return (
      <Message size="tab" tone="error" onRetry={reload}>
        {result.error}
      </Message>
    );
  }

  const pr = result.data;
  const badge = stateBadge(pr);
  const conversation: Array<PrComment> = [...pr.comments, ...pr.reviews.filter((r) => r.body.trim() !== "" || r.reviewState !== "COMMENTED")]
    .filter((c) => c.createdAt !== "")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const additions = pr.files.reduce((n, f) => n + f.additions, 0);
  const deletions = pr.files.reduce((n, f) => n + f.deletions, 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1 text-lg font-semibold">
            {pr.title} <span className="font-normal text-zinc-500">#{pr.number}</span>
          </h1>
          <RefreshButton
            loading={loading || diff.loading}
            className={`${ICON_BUTTON_BASE} p-1.5`}
            onClick={() => {
              reload();
              diff.reload();
            }}
          />
          <a
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Open on GitHub <ExternalLink size={12} />
          </a>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${badge.className}`}>
            <PrStateIcon state={pr.state} isDraft={pr.isDraft} size={12} />
            {badge.label}
          </span>
          {pr.author !== undefined && <span className="font-medium text-zinc-700 dark:text-zinc-300">{pr.author}</span>}
          <span>wants to merge</span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{pr.headRefName}</span>
          <span>→</span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{pr.baseRefName}</span>
        </div>
      </header>

      <section className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        {pr.body.trim() === "" ? <p className="text-sm italic text-zinc-500">No description provided.</p> : <Markdown>{pr.body}</Markdown>}
      </section>

      <section className="border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="flex items-center gap-2 px-6 py-3 text-sm font-semibold">
          Files changed
          <span className="font-normal text-zinc-500">
            {pr.files.length} {pr.files.length === 1 ? "file" : "files"} · <span className="text-green-600 dark:text-green-400">+{additions}</span>{" "}
            <span className="text-red-600 dark:text-red-400">-{deletions}</span>
          </span>
        </h2>
        <PrDiff diff={diff} />
      </section>

      <section className="px-6 py-4">
        <h2 className="mb-3 text-sm font-semibold">Conversation</h2>
        {conversation.length === 0 && <p className="text-sm text-zinc-500">No comments yet.</p>}
        <ol className="flex flex-col gap-3">
          {conversation.map((entry) => (
            <li key={entry.url ?? `${entry.reviewState ?? "comment"}:${entry.author ?? ""}:${entry.createdAt}`} className="rounded-md border border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{entry.author ?? "Unknown"}</span>
                {entry.reviewState === undefined ? (
                  <span>commented</span>
                ) : (
                  <span className={entry.reviewState === "APPROVED" ? "text-green-700 dark:text-green-400" : entry.reviewState === "CHANGES_REQUESTED" ? "text-red-700 dark:text-red-400" : ""}>
                    {REVIEW_LABEL[entry.reviewState] ?? entry.reviewState.toLowerCase()}
                  </span>
                )}
                {now > 0 && <span className="ml-auto">{relativeTime(Date.parse(entry.createdAt), now)}</span>}
              </div>
              {entry.body.trim() !== "" && (
                <div className="px-3 py-1">
                  <Markdown>{entry.body}</Markdown>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
