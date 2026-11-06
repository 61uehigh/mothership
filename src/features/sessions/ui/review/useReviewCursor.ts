"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { nextHunk, nextLine, type LineRef } from "@/features/sessions/ui/review/reviewCursor";
import { lineId } from "@/features/sessions/ui/review/reviewMessage";
import { useCommands, type Command } from "@/shell/commands/commandContext";
import type { DiffFile } from "@/ui/parseDiff";
import { useT } from "@/ui/i18n/useT";

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
  const t = useT();
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
      const move = (find: typeof nextLine, delta: number) => {
        const next = find(latest.current.flat, latest.current.cursor, delta);
        if (next !== undefined) setCursor(next);
      };
      const step = (delta: number) => move(nextLine, delta);
      const hunkStep = (delta: number) => move(nextHunk, delta);
      return [
        { id: "review-next-line", title: t("sessions.review.cmdNextLine"), group: "Review", priority: 10, keys: ["j"], run: () => step(1) },
        { id: "review-prev-line", title: t("sessions.review.cmdPrevLine"), group: "Review", priority: 10, keys: ["k"], run: () => step(-1) },
        { id: "review-next-hunk", title: t("sessions.review.cmdNextHunk"), group: "Review", priority: 10, keys: ["]"], run: () => hunkStep(1) },
        { id: "review-prev-hunk", title: t("sessions.review.cmdPrevHunk"), group: "Review", priority: 10, keys: ["["], run: () => hunkStep(-1) },
        {
          id: "review-comment",
          title: t("sessions.review.cmdComment"),
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
          title: t("sessions.common.approveAndMerge"),
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
          title: t("sessions.review.discardChanges"),
          group: "Review",
          priority: 10,
          keys: ["shift+x"],
          run: () => {
            if (latest.current.active) openDialog("discard");
          },
        },
      ];
    },
    // State setters are stable, so the commands register again only when the language changes.
    [edit, openDialog, t],
  );
  useCommands(commands);

  useEffect(() => {
    if (cursor !== undefined) document.querySelector(`[data-line="${CSS.escape(cursor)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return { cursor, setCursor };
}
