"use client";

import { CircleDot, Folder, Reply, Tag, User, Users } from "lucide-react";
import { useState } from "react";
import { relativeTime } from "@/ui/format";
import { useShell } from "@/shell/ShellContext";
import { draftFor } from "@/features/tools/ui/delegation";
import { linearHandOffItem } from "@/features/tools/ui/handOff";
import { Markdown } from "@/shell/Markdown";
import { Composer } from "@/features/tools/ui/Composer";
import { Reactions } from "@/features/tools/ui/Reactions";
import { HandOffButton, postTool, useToolDocument } from "@/features/tools/ui/toolDoc";
import { Chip, TabFrame } from "@/shell/TabFrame";
import { TONE_CLASSES } from "@/features/tools/ui/toolPane";
import type { LinearComment, LinearIssue } from "@/features/tools/model/Tools";
import { useNow } from "@/ui/useNow";
import type { Tab } from "@/shell/tabs";

const CLOCK_TICK_MS = 30_000;

// Linear priority values: 1 urgent, 2 high, 3 medium, 4 low, 0 none.
const PRIORITY_CLASS: Record<number, string> = { 1: TONE_CLASSES.danger, 2: TONE_CLASSES.warning };

/**
 * ### IssueTab
 *
 * Center tab showing one Linear issue with its comment threads, read through
 * `GET /api/tools/linear/issue`. You can comment, reply in a thread, and add
 * or remove emoji reactions (reactions need `LINEAR_API_KEY`).
 */
export function IssueTab({ tab }: { tab: Extract<Tab, { kind: "issue" }> }) {
  const { openNewAgent } = useShell();
  const now = useNow(CLOCK_TICK_MS);
  const state = useToolDocument<LinearIssue>(`/api/tools/linear/issue?id=${encodeURIComponent(tab.issueId)}`);
  const issue = state.data;
  const [replyingTo, setReplyingTo] = useState<string | undefined>(undefined);

  async function comment(body: string, parentId?: string) {
    if (issue === undefined) return;
    await postTool("/api/tools/linear/comment", { issueId: issue.id, body, ...(parentId === undefined ? {} : { parentId }) });
    setReplyingTo(undefined);
    state.reload();
  }
  const react = issue?.canReact
    ? {
        add: (target: { commentId: string } | { issueId: string }) => async (emoji: string) => {
          await postTool("/api/tools/linear/reaction", { action: "add", ...target, emoji });
          state.reload();
        },
        remove: async (reactionId: string) => {
          await postTool("/api/tools/linear/reaction", { action: "remove", reactionId });
          state.reload();
        },
      }
    : undefined;

  // Top-level comments in order, each followed by its replies.
  const threads = (issue?.comments ?? [])
    .filter((c) => c.parentId === undefined || !issue?.comments.some((p) => p.id === c.parentId))
    .map((top) => ({ top, replies: (issue?.comments ?? []).filter((c) => c.parentId !== undefined && c.parentId === top.id) }));

  const renderComment = (c: LinearComment, index: number) => (
    <div key={c.id ?? index} className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-1.5 flex items-baseline gap-2 text-xs">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{c.author ?? "Unknown"}</span>
        {now > 0 && c.createdAt > 0 && (
          <span className="text-zinc-500" title={new Date(c.createdAt).toLocaleString()}>
            {relativeTime(c.createdAt, now)}
          </span>
        )}
      </div>
      <Markdown>{c.body}</Markdown>
      {c.id !== undefined && react !== undefined && <Reactions reactions={c.reactions} onAdd={react.add({ commentId: c.id })} onRemove={react.remove} />}
    </div>
  );

  return (
    <TabFrame
      title={issue?.title ?? tab.title}
      chips={
        <>
          <Chip className="bg-zinc-200/70 font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{issue?.id ?? tab.issueId}</Chip>
          {issue?.status !== undefined && (
            <Chip>
              <CircleDot size={11} aria-hidden />
              {issue.status}
            </Chip>
          )}
          {issue?.priority !== undefined && issue.priority.value !== 0 && (
            <Chip className={PRIORITY_CLASS[issue.priority.value]}>{issue.priority.name}</Chip>
          )}
          {issue?.assignee !== undefined && (
            <Chip>
              <User size={11} aria-hidden />
              {issue.assignee}
            </Chip>
          )}
          {issue?.team !== undefined && (
            <Chip>
              <Users size={11} aria-hidden />
              {issue.team}
            </Chip>
          )}
          {issue?.project !== undefined && (
            <Chip>
              <Folder size={11} aria-hidden />
              {issue.project}
            </Chip>
          )}
          {issue?.labels.map((label) => (
            <Chip key={label}>
              <Tag size={11} aria-hidden />
              {label}
            </Chip>
          ))}
        </>
      }
      open={{ label: "Open in Linear", url: issue?.url }}
      actions={<HandOffButton onHandOff={issue === undefined ? undefined : () => openNewAgent(draftFor("linear", linearHandOffItem(issue)))} />}
      state={state}
    >
      {issue !== undefined && (
        <>
          {issue.markdown.trim() === "" ? <p className="text-sm text-zinc-500">No description.</p> : <Markdown>{issue.markdown}</Markdown>}
          {react !== undefined && <Reactions reactions={issue.reactions} onAdd={react.add({ issueId: issue.id })} onRemove={react.remove} />}
          <section className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Comments <span className="font-normal text-zinc-500">{issue.comments.length}</span>
            </h2>
            {issue.comments.length === 0 && <p className="text-sm text-zinc-500">No comments yet.</p>}
            {threads.map(({ top, replies }, index) => (
              <div key={top.id ?? index} className="flex flex-col gap-2">
                {renderComment(top, index)}
                {replies.length > 0 && <div className="ml-6 flex flex-col gap-2">{replies.map(renderComment)}</div>}
                {top.id !== undefined &&
                  (replyingTo === top.id ? (
                    <div className="ml-6">
                      <Composer
                        autoFocus
                        placeholder="Reply in this thread"
                        draftKey={`linear:${tab.issueId}:${top.id}`}
                        submitLabel="Reply"
                        onSubmit={(body) => comment(body, top.id)}
                        onCancel={() => setReplyingTo(undefined)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyingTo(top.id)}
                      className="ml-6 flex w-fit items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      <Reply size={12} aria-hidden />
                      Reply
                    </button>
                  ))}
              </div>
            ))}
            <Composer draftKey={`linear:${tab.issueId}`} placeholder="Leave a comment (Markdown)" submitLabel="Comment" onSubmit={(body) => comment(body)} />
          </section>
        </>
      )}
    </TabFrame>
  );
}
