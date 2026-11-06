/**
 * ### LineRef
 *
 * A diff line in reading order, with an id that survives the diff reloading.
 */
export type LineRef = { id: string; file: number; hunk: number };

/**
 * ### nextLine
 *
 * The line `delta` lines from `cursor`, kept within the list. With no
 * cursor, or one whose line is gone after a reload, it counts from just
 * before the first line.
 *
 * @returns The line's id, or `undefined` for an empty diff.
 */
export function nextLine(lines: ReadonlyArray<LineRef>, cursor: string | undefined, delta: number): string | undefined {
  if (lines.length === 0) return undefined;
  const index = cursor === undefined ? -1 : lines.findIndex((r) => r.id === cursor);
  return lines[Math.min(Math.max(index + delta, 0), lines.length - 1)].id;
}

/** Orders hunks by file, then by hunk within the file. */
const compareHunks = (a: LineRef, b: LineRef): number => a.file - b.file || a.hunk - b.hunk;

/**
 * ### nextHunk
 *
 * The first line of the next hunk (`delta` > 0) or the previous one
 * (`delta` < 0), across files. From a hunk's own first line, going back
 * moves to the hunk before. With no cursor, or one whose line is gone,
 * going forward picks the first hunk and going back finds nothing.
 *
 * @returns The line's id, or `undefined` when there is no hunk that way.
 */
export function nextHunk(lines: ReadonlyArray<LineRef>, cursor: string | undefined, delta: number): string | undefined {
  // A hunk starts where the previous line belongs to another hunk.
  const starts = lines.filter((r, i) => i === 0 || compareHunks(lines[i - 1], r) !== 0);
  const here = lines.find((r) => r.id === cursor);
  if (here === undefined) return delta > 0 ? starts[0]?.id : undefined;
  const next = delta > 0 ? starts.find((r) => compareHunks(r, here) > 0) : starts.findLast((r) => compareHunks(r, here) < 0);
  return next?.id;
}
