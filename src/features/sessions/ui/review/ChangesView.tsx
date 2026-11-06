"use client";

import { useCallback, useState } from "react";
import type { Agent } from "@/features/sessions/model/Agent";
import { DiffFileSection } from "@/features/sessions/ui/review/DiffFileSection";
import { ReviewFooter } from "@/features/sessions/ui/review/ReviewFooter";
import { useReviewComments } from "@/features/sessions/ui/review/useReviewComments";
import { useReviewCursor } from "@/features/sessions/ui/review/useReviewCursor";
import { useWorktreeDiff } from "@/features/sessions/ui/review/useWorktreeDiff";
import { DiscardDialog, MergeDialog } from "@/features/sessions/ui/review/WorktreeActions";

/**
 * ### ChangesView
 *
 * Review of an agent's worktree: unified diff per file, comments on any line,
 * and actions to send the review back, merge, or discard. Reloads the diff
 * whenever the agent finishes a turn.
 */
export function ChangesView({ agent }: { agent: Agent & { worktree: NonNullable<Agent["worktree"]> } }) {
  const active = agent.worktree.state === "active";
  const running = agent.status === "running";
  const { files, error, load } = useWorktreeDiff(agent, active);
  const { comments, editing, setEditing, summary, setSummary, notice, setNotice, sendError, saveComment, sendReview } = useReviewComments(agent.id);
  const [dialog, setDialog] = useState<"merge" | "discard" | undefined>(undefined);
  const cancelEdit = useCallback(() => setEditing(undefined), [setEditing]);
  const { cursor, setCursor } = useReviewCursor({ files, active, running, edit: setEditing, openDialog: setDialog });

  if (!active) {
    return (
      <p className="p-4 text-sm text-zinc-500">
        {agent.worktree.state === "merged"
          ? `Merged into ${agent.worktree.baseBranch}.`
          : "This work was discarded. Its worktree and branch have been deleted."}
      </p>
    );
  }

  const additions = files?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const deletions = files?.reduce((n, f) => n + f.deletions, 0) ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="font-mono">{agent.worktree.branch}</span>
        <span>→ {agent.worktree.baseBranch}</span>
        {files !== undefined && (
          <span>
            {files.length} {files.length === 1 ? "file" : "files"} · <span className="text-green-600">+{additions}</span>{" "}
            <span className="text-red-600">-{deletions}</span>
          </span>
        )}
        <button type="button" className="ml-auto hover:underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px]">
        {error !== undefined && <p className="p-4 font-sans text-sm text-red-600">{error}</p>}
        {files === undefined && error === undefined && <p className="p-4 font-sans text-sm text-zinc-500">Loading…</p>}
        {files?.length === 0 && <p className="p-4 font-sans text-sm text-zinc-500">No changed files yet.</p>}
        {files?.map((file) => (
          <DiffFileSection
            key={file.path}
            file={file}
            // Only the file holding the cursor or the open comment gets it, so a j/k press re-renders one or two files.
            cursor={ownedBy(cursor, file.path)}
            comments={comments}
            editing={ownedBy(editing, file.path)}
            onSelect={setCursor}
            onEdit={setEditing}
            onSave={saveComment}
            onCancel={cancelEdit}
          />
        ))}
      </div>

      <ReviewFooter
        notice={notice}
        error={sendError}
        summary={summary}
        onSummaryChange={setSummary}
        commentCount={comments.length}
        running={running}
        onSend={() => void sendReview()}
        onMerge={() => setDialog("merge")}
        onDiscard={() => setDialog("discard")}
      />

      {dialog === "merge" && (
        <MergeDialog
          agent={agent}
          fileCount={files?.length}
          onClose={() => setDialog(undefined)}
          onDone={(commit) => {
            setDialog(undefined);
            setNotice(`Merged (${commit.slice(0, 8)}).`);
          }}
        />
      )}
      {dialog === "discard" && <DiscardDialog agent={agent} onClose={() => setDialog(undefined)} onDone={() => setDialog(undefined)} />}
    </div>
  );
}

/** The line key when it belongs to the file at `path` (keys start with the path, see `lineId`). */
const ownedBy = (key: string | undefined, path: string) => (key?.startsWith(`${path}|`) === true ? key : undefined);
