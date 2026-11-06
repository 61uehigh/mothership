"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { lineId } from "@/features/sessions/ui/review/reviewMessage";
import { useCommands, type Command } from "@/shell/commands/CommandProvider";
import type { DiffFile } from "@/ui/parseDiff";

/** A diff line in reading order, with an id that survives the diff reloading. */
type LineRef = { id: string; file: number; hunk: number };

/**
 * ### ReviewCursorOptions
 *
 * What the review commands act on. `edit` and `openDialog` must be stable
 * (state setters), or the commands register again on every render.
 */
export type ReviewCursorOptions = {
  files: Array<DiffFile> | undefined;
  /** The worktree can still be merged or discarded. */
  active: boolean;
  /** The agent is working; merging waits for it. */
  running: boolean;
  /** Opens the comment box on a line, by `lineId`. */
  edit: (key: string) => void;
  openDialog: (dialog: "merge" | "discard") => void;
};

/**
 * ### useReviewCursor
 *
 * The selected diff line (a `lineId`) and the `review-*` commands: move by
 * line or hunk, comment on the selected line, merge, and discard. The
 * commands act on the latest render but are registered only once. The
 * selected line is scrolled into view whenever it changes.
 */
export function useReviewCursor({ files, active, running, edit, openDialog }: ReviewCursorOptions): {
  cursor: string | undefined;
  setCursor: Dispatch<SetStateAction<string | undefined>>;
} {
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const flat = useMemo(() => {
    const refs: Array<LineRef> = [];
    files?.forEach((f, file) => f.hunks.forEach((h, hunk) => h.lines.forEach((line) => refs.push({ id: lineId(f.path, line), file, hunk }))));
    return refs;
  }, [files]);

  // Commands read the latest render through this ref so they register once.
  const latest = useRef({ flat, cursor, active, running });
  useEffect(() => {
    latest.current = { flat, cursor, active, running };
  });

  const commands = useMemo<Array<Command>>(
    () => {
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
          group: "Review",
          priority: 10,
          keys: ["enter"],
          run: () => {
            const at = latest.current.cursor;
            if (at === undefined) return false;
            edit(at);
          },
        },
        {
          id: "review-merge",
          title: "Approve and merge",
          group: "Review",
          priority: 10,
          keys: ["shift+a"],
          run: () => {
            // Same rule as the button: no merging while the agent works.
            if (latest.current.active && !latest.current.running) openDialog("merge");
          },
        },
        {
          id: "review-discard",
          title: "Discard changes",
          group: "Review",
          priority: 10,
          keys: ["shift+x"],
          run: () => {
            if (latest.current.active) openDialog("discard");
          },
        },
      ];
    },
    // State setters are stable, so the commands still register once.
    [edit, openDialog],
  );
  useCommands(commands);

  useEffect(() => {
    if (cursor !== undefined) document.querySelector(`[data-line="${CSS.escape(cursor)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return { cursor, setCursor };
}
