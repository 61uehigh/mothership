"use client";

import { formatBinding } from "@/shell/commands/keys";

/**
 * ### ReviewFooter
 *
 * The box under the diff: the overall comment, and buttons to send the
 * review, approve and merge (not while the agent works), or discard.
 */
export function ReviewFooter({
  notice,
  error,
  summary,
  onSummaryChange,
  commentCount,
  running,
  onSend,
  onMerge,
  onDiscard,
}: {
  notice: string | undefined;
  /** Why sending the review failed. */
  error: string | undefined;
  summary: string;
  onSummaryChange: (summary: string) => void;
  commentCount: number;
  running: boolean;
  onSend: () => void;
  onMerge: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
      {notice !== undefined && <p className="text-xs text-teal-700 dark:text-teal-300">{notice}</p>}
      {error !== undefined && <p className="break-words text-xs text-red-600 dark:text-red-400">Couldn&apos;t send the review: {error}</p>}
      <textarea
        rows={2}
        className="resize-none rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        placeholder={`Overall comment (optional) · select a line and press ${formatBinding("enter")} to comment on it`}
        value={summary}
        onChange={(e) => onSummaryChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={commentCount === 0 && summary.trim() === ""}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          onClick={onSend}
        >
          Send review{commentCount > 0 ? ` (${commentCount})` : ""}
        </button>
        <button
          type="button"
          disabled={running}
          title={formatBinding("shift+a")}
          className="rounded-md border border-teal-500 px-3 py-1.5 text-sm text-teal-700 disabled:opacity-40 dark:text-teal-300"
          onClick={onMerge}
        >
          Approve and merge
        </button>
        <button
          type="button"
          title={formatBinding("shift+x")}
          className="ml-auto rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
