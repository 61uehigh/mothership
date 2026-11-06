"use client";

import { Fragment, memo, useMemo, useState } from "react";
import { lineId, type ReviewComment } from "@/features/sessions/ui/review/reviewMessage";
import { formatBinding } from "@/shell/commands/keys";
import type { DiffFile, DiffLine } from "@/ui/parseDiff";

const LINE_STYLE: Record<DiffLine["kind"], string> = {
  add: "bg-green-50 dark:bg-green-950/40",
  del: "bg-red-50 dark:bg-red-950/40",
  ctx: "",
};

/**
 * ### DiffFileSection
 *
 * One file of the review: its header, then each hunk's lines with the
 * selected line outlined and a comment box under any line that has a comment
 * or is being commented on. Lines are keyed by `lineId`.
 */
export const DiffFileSection = memo(function DiffFileSection({
  file,
  cursor,
  comments,
  editing,
  onSelect,
  onEdit,
  onSave,
  onCancel,
}: {
  file: DiffFile;
  cursor: string | undefined;
  comments: Array<ReviewComment>;
  editing: string | undefined;
  onSelect: (key: string) => void;
  onEdit: (key: string) => void;
  onSave: (key: string, path: string, line: DiffLine, text: string) => void;
  onCancel: () => void;
}) {
  const byKey = useMemo(() => new Map(comments.map((c) => [c.key, c])), [comments]);
  return (
    <section className="border-b border-zinc-200 dark:border-zinc-800">
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
            const comment = byKey.get(key);
            const selected = cursor === key;
            return (
              <Fragment key={li}>
                <div
                  data-line={key}
                  onClick={() => onSelect(key)}
                  onDoubleClick={() => onEdit(key)}
                  className={`flex cursor-pointer whitespace-pre ${LINE_STYLE[line.kind]} ${selected ? "outline outline-1 -outline-offset-1 outline-teal-500" : ""}`}
                >
                  <span className="w-10 shrink-0 select-none pr-1 text-right text-zinc-400">{line.oldNo ?? ""}</span>
                  <span className="w-10 shrink-0 select-none pr-2 text-right text-zinc-400">{line.newNo ?? ""}</span>
                  <span className="w-4 shrink-0 select-none text-zinc-500">{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}</span>
                  <span>{line.text}</span>
                </div>
                {(editing === key || comment !== undefined) && (
                  <CommentBox
                    initial={comment?.text ?? ""}
                    editing={editing === key}
                    onEdit={() => onEdit(key)}
                    onSave={(text) => onSave(key, file.path, line, text)}
                    onCancel={onCancel}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      ))}
    </section>
  );
});

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
      <button
        type="button"
        onClick={onEdit}
        className="ml-24 block border-l-2 border-amber-400 px-2 py-1 text-left font-sans text-xs text-amber-800 dark:text-amber-300"
      >
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
