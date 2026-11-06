"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import { formatBinding } from "@/shell/commands/keys";
import { parseDiff, type DiffFile, type DiffLine } from "@/ui/parseDiff";
import { DiscardDialog, MergeDialog } from "@/features/sessions/ui/review/WorktreeActions";
import type { Agent } from "@/features/sessions/model/Agent";
import { fetchText } from "@/ui/useJson";

/** A diff line in reading order, with an id that survives the diff reloading. */
type LineRef = { id: string; file: number; hunk: number };
type Comment = { key: string; path: string; line: DiffLine; text: string };

/**
 * Identifies a line by file and line numbers rather than by position, so a
 * pending comment and the cursor stay on the same line when the diff reloads
 * after the agent's next turn.
 */
const lineId = (path: string, line: DiffLine) => `${path}|${line.kind}|${line.oldNo ?? ""}|${line.newNo ?? ""}`;

const LINE_STYLE: Record<DiffLine["kind"], string> = {
  add: "bg-green-50 dark:bg-green-950/40",
  del: "bg-red-50 dark:bg-red-950/40",
  ctx: "",
};

function reviewMessage(comments: Array<Comment>, summary: string): string {
  const body = comments.map((c) => {
    const lineNo = c.line.newNo ?? c.line.oldNo;
    const sign = c.line.kind === "add" ? "+" : c.line.kind === "del" ? "-" : " ";
    return `${c.path}:${lineNo}\n    ${sign} ${c.line.text.trim()}\n  → ${c.text}`;
  });
  return ["[Code review] Please address the comments below.", summary.trim(), ...body].filter((part) => part !== "").join("\n\n");
}

/**
 * ### ChangesView
 *
 * Review of an agent's worktree: unified diff per file, comments on any line,
 * and actions to send the review back, merge, or discard. Reloads the diff
 * whenever the agent finishes a turn.
 */
export function ChangesView({
  agent,
}: {
  agent: Agent & { worktree: NonNullable<Agent["worktree"]> };
}) {
  const [files, setFiles] = useState<Array<DiffFile> | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [comments, setComments] = useState<Array<Comment>>([]);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState("");
  const [dialog, setDialog] = useState<"merge" | "discard" | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const active = agent.worktree.state === "active";

  const load = useCallback(async () => {
    const result = await fetchText(`/api/agents/${agent.id}/diff`);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setFiles(parseDiff(result.data));
  }, [agent.id]);

  // Load once on opening, then again after each finished turn (a running agent's diff changes under us).
  useEffect(() => {
    if (!active || (agent.status === "running" && files !== undefined)) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
    // `files` only marks the first load; its later changes must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, agent.status, agent.lastActivityAt, load]);

  const flat = useMemo(() => {
    const refs: Array<LineRef> = [];
    files?.forEach((f, file) => f.hunks.forEach((h, hunk) => h.lines.forEach((line) => refs.push({ id: lineId(f.path, line), file, hunk }))));
    return refs;
  }, [files]);

  async function sendReview() {
    const response = await fetch(`/api/agents/${agent.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reviewMessage(comments, summary) }),
    });
    if (response.ok) {
      setComments([]);
      setSummary("");
      setNotice("Review sent. Changes will refresh once the agent applies it.");
    }
  }

  // Commands read the latest render through this ref so they register once.
  const latest = useRef({ flat, cursor, files, active, running: agent.status === "running" });
  useEffect(() => {
    latest.current = { flat, cursor, files, active, running: agent.status === "running" };
  });

  const commands = useMemo<Array<Command>>(() => {
    const step = (delta: number) => {
      const { flat: list, cursor: at } = latest.current;
      if (list.length === 0) return;
      const index = at === undefined ? -1 : list.findIndex((r) => r.id === at);
      setCursor(list[Math.min(Math.max(index + delta, 0), list.length - 1)].id);
    };
    const hunkStep = (delta: number) => {
      const { flat: list, cursor: at } = latest.current;
      // A hunk starts where the previous line belongs to another hunk.
      const starts = list.filter((r, i) => i === 0 || list[i - 1].file !== r.file || list[i - 1].hunk !== r.hunk);
      if (starts.length === 0) return;
      const order = (r: LineRef) => r.file * 1e6 + r.hunk;
      const here = list.find((r) => r.id === at);
      const current = here === undefined ? -1 : order(here);
      const next = delta > 0 ? starts.find((r) => order(r) > current) : [...starts].reverse().find((r) => order(r) < current);
      if (next !== undefined) setCursor(next.id);
    };
    return [
      { id: "review-next-line", title: "Next line", group: "Review", priority: 10, keys: ["j"], run: () => step(1) },
      { id: "review-prev-line", title: "Previous line", group: "Review", priority: 10, keys: ["k"], run: () => step(-1) },
      { id: "review-next-hunk", title: "Next hunk", group: "Review", priority: 10, keys: ["]"], run: () => hunkStep(1) },
      { id: "review-prev-hunk", title: "Previous hunk", group: "Review", priority: 10, keys: ["["], run: () => hunkStep(-1) },
      {
        id: "review-comment",
        title: "Comment on selected line",
        group: "Review", priority: 10,
        keys: ["enter"],
        run: () => {
          const at = latest.current.cursor;
          if (at === undefined) return false;
          setEditing(at);
        },
      },
      {
        id: "review-merge",
        title: "Approve and merge",
        group: "Review", priority: 10,
        keys: ["shift+a"],
        run: () => {
          // Same rule as the button: no merging while the agent works.
          if (latest.current.active && !latest.current.running) setDialog("merge");
        },
      },
      {
        id: "review-discard",
        title: "Discard changes",
        group: "Review", priority: 10,
        keys: ["shift+x"],
        run: () => {
          if (latest.current.active) setDialog("discard");
        },
      },
    ];
  }, []);
  useCommands(commands);

  useEffect(() => {
    if (cursor !== undefined) document.querySelector(`[data-line="${CSS.escape(cursor)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

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
            {files.length} {files.length === 1 ? "file" : "files"} · <span className="text-green-600">+{additions}</span> <span className="text-red-600">-{deletions}</span>
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
          <section key={file.path} className="border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="sticky top-0 z-10 flex gap-2 bg-zinc-100 px-3 py-1.5 font-sans text-xs font-medium dark:bg-zinc-900">
              <span className="truncate">{file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`}</span>
              <span className="text-zinc-500">{{ added: "New file", deleted: "Deleted", modified: "", renamed: "Renamed" }[file.status]}</span>
              <span className="ml-auto text-green-600">+{file.additions}</span>
              <span className="text-red-600">-{file.deletions}</span>
            </h3>
            {file.binary && <p className="px-3 py-2 font-sans text-xs text-zinc-500">Binary file</p>}
            {file.hunks.map((hunk, hi) => (
              <div key={hi}>
                <div className="bg-sky-50 px-3 py-0.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">{hunk.header}</div>
                {hunk.lines.map((line, li) => {
                  const key = lineId(file.path, line);
                  const comment = comments.find((c) => c.key === key);
                  const selected = cursor === key;
                  return (
                    <Fragment key={li}>
                      <div
                        data-line={key}
                        onClick={() => setCursor(key)}
                        onDoubleClick={() => setEditing(key)}
                        className={`flex cursor-pointer whitespace-pre ${LINE_STYLE[line.kind]} ${selected ? "outline outline-1 -outline-offset-1 outline-teal-500" : ""}`}
                      >
                        <span className="w-10 shrink-0 select-none pr-1 text-right text-zinc-400">{line.oldNo ?? ""}</span>
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-zinc-400">{line.newNo ?? ""}</span>
                        <span className="w-4 shrink-0 select-none text-zinc-500">
                          {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                        </span>
                        <span>{line.text}</span>
                      </div>
                      {(editing === key || comment !== undefined) && (
                        <CommentBox
                          initial={comment?.text ?? ""}
                          editing={editing === key}
                          onEdit={() => setEditing(key)}
                          onSave={(text) => {
                            setComments((list) => [
                              ...list.filter((c) => c.key !== key),
                              ...(text.trim() === "" ? [] : [{ key, path: file.path, line, text: text.trim() }]),
                            ]);
                            setEditing(undefined);
                          }}
                          onCancel={() => setEditing(undefined)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        {notice !== undefined && <p className="text-xs text-teal-700 dark:text-teal-300">{notice}</p>}
        <textarea
          rows={2}
          className="resize-none rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          placeholder={`Overall comment (optional) · select a line and press ${formatBinding("enter")} to comment on it`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={comments.length === 0 && summary.trim() === ""}
            className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            onClick={() => void sendReview()}
          >
            Send review{comments.length > 0 ? ` (${comments.length})` : ""}
          </button>
          <button
            type="button"
            disabled={agent.status === "running"}
            title={formatBinding("shift+a")}
            className="rounded-md border border-teal-500 px-3 py-1.5 text-sm text-teal-700 disabled:opacity-40 dark:text-teal-300"
            onClick={() => setDialog("merge")}
          >
            Approve and merge
          </button>
          <button
            type="button"
            title={formatBinding("shift+x")}
            className="ml-auto rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={() => setDialog("discard")}
          >
            Discard
          </button>
        </div>
      </div>

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

function CommentBox({
  initial,
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  initial: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  if (!editing) {
    return (
      <button type="button" onClick={onEdit} className="ml-24 block border-l-2 border-amber-400 px-2 py-1 text-left font-sans text-xs text-amber-800 dark:text-amber-300">
        💬 {initial}
      </button>
    );
  }
  return (
    <div className="ml-24 flex gap-2 py-1 pr-3 font-sans">
      <textarea
        autoFocus
        rows={2}
        className="flex-1 resize-none rounded border border-amber-400 bg-white px-2 py-1 text-xs dark:bg-zinc-900"
        placeholder={`Comment on this line (${formatBinding("mod+enter")} to save, Esc to cancel)`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(text);
        }}
      />
      <button type="button" className="text-xs text-teal-700 dark:text-teal-300" onClick={() => onSave(text)}>
        Save
      </button>
    </div>
  );
}
