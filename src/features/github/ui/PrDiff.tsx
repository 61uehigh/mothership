"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { parseDiff, type DiffFile, type DiffLine } from "@/ui/parseDiff";
import { useToggleSet } from "@/ui/useToggleSet";
import type { Fetched } from "@/ui/useJson";

const LINE_STYLE: Record<DiffLine["kind"], string> = {
  add: "bg-green-50 dark:bg-green-950/40",
  del: "bg-red-50 dark:bg-red-950/40",
  ctx: "",
};

const STATUS_LABEL: Record<DiffFile["status"], string> = { added: "New file", deleted: "Deleted", modified: "", renamed: "Renamed" };

/**
 * ### PrDiff
 *
 * Read-only unified diff of a pull request, one collapsible section per
 * file, rendered like the worktree review.
 *
 * @param diff - The unified diff from `/api/github/pr/diff`, loaded by the caller so its refresh covers both.
 */
export function PrDiff({ diff }: { diff: Fetched<string> }) {
  const [collapsed, toggle] = useToggleSet<string>();
  const files = useMemo(() => (diff.data === undefined ? undefined : parseDiff(diff.data)), [diff.data]);

  if (diff.error !== undefined) {
    return (
      <div className="px-4 py-3 text-sm">
        <p className="text-red-600 dark:text-red-400">{diff.error}</p>
        <button type="button" className="mt-2 text-teal-700 underline dark:text-teal-400" onClick={diff.reload}>
          Try again
        </button>
      </div>
    );
  }
  if (files === undefined) return <p className="px-4 py-3 text-sm text-zinc-500">Loading diff…</p>;
  if (files.length === 0) return <p className="px-4 py-3 text-sm text-zinc-500">No changes.</p>;

  return (
    <div className="font-mono text-[12px]">
      {files.map((file) => {
        const open = !collapsed.has(file.path);
        return (
          <section key={file.path} className="border-b border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(file.path)}
              className="sticky top-0 z-10 flex w-full items-center gap-2 bg-zinc-100 px-3 py-1.5 text-left font-sans text-xs font-medium hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              {open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
              <span className="truncate">{file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`}</span>
              <span className="text-zinc-500">{STATUS_LABEL[file.status]}</span>
              <span className="ml-auto text-green-600 dark:text-green-400">+{file.additions}</span>
              <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
            </button>
            {open && file.binary && <p className="px-3 py-2 font-sans text-xs text-zinc-500">Binary file</p>}
            {open &&
              file.hunks.map((hunk) => (
                <div key={hunk.header} className="overflow-x-auto">
                  <div className="bg-sky-50 px-3 py-0.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">{hunk.header}</div>
                  {hunk.lines.map((line) => (
                    <div key={`${line.oldNo ?? ""}:${line.newNo ?? ""}`} className={`flex min-w-fit whitespace-pre ${LINE_STYLE[line.kind]}`}>
                      <span className="w-10 shrink-0 select-none pr-1 text-right text-zinc-400 dark:text-zinc-600">{line.oldNo ?? ""}</span>
                      <span className="w-10 shrink-0 select-none pr-2 text-right text-zinc-400 dark:text-zinc-600">{line.newNo ?? ""}</span>
                      <span className="w-4 shrink-0 select-none text-zinc-500">{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}</span>
                      <span>{line.text}</span>
                    </div>
                  ))}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
