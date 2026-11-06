/**
 * ### DiffLine
 *
 * One line of a hunk. Line numbers are 1-based; added lines have no old
 * number and deleted lines no new number.
 */
export type DiffLine = { kind: "add" | "del" | "ctx"; oldNo: number | undefined; newNo: number | undefined; text: string };

/**
 * ### DiffHunk
 *
 * A `@@` section of a file diff.
 */
export type DiffHunk = { header: string; lines: Array<DiffLine> };

/**
 * ### DiffFile
 *
 * One file in a unified diff.
 */
export type DiffFile = {
  path: string;
  /** Previous path, for renames. */
  oldPath: string | undefined;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: Array<DiffHunk>;
};

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * ### parseDiff
 *
 * Parses `git diff` output (no color, `a/` and `b/` prefixes).
 *
 * @returns Files in diff order.
 */
export function parseDiff(text: string): Array<DiffFile> {
  const files: Array<DiffFile> = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldNo = 0;
  let newNo = 0;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = / b\/(.*)$/.exec(line);
      file = { path: match?.[1] ?? line, oldPath: undefined, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [] };
      files.push(file);
      hunk = undefined;
    } else if (file === undefined) {
      continue;
    } else if (line.startsWith("new file mode")) {
      file.status = "added";
    } else if (line.startsWith("deleted file mode")) {
      file.status = "deleted";
    } else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = line.slice("rename from ".length);
    } else if (line.startsWith("Binary files ")) {
      file.binary = true;
    } else if (HUNK_HEADER.test(line)) {
      const [, oldStart, newStart] = HUNK_HEADER.exec(line) ?? [];
      oldNo = Number(oldStart);
      newNo = Number(newStart);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (hunk !== undefined && line.startsWith("+")) {
      hunk.lines.push({ kind: "add", oldNo: undefined, newNo: newNo++, text: line.slice(1) });
      file.additions++;
    } else if (hunk !== undefined && line.startsWith("-")) {
      hunk.lines.push({ kind: "del", oldNo: oldNo++, newNo: undefined, text: line.slice(1) });
      file.deletions++;
    } else if (hunk !== undefined && line.startsWith(" ")) {
      hunk.lines.push({ kind: "ctx", oldNo: oldNo++, newNo: newNo++, text: line.slice(1) });
    }
    // "\ No newline at end of file" and header lines (index, ---, +++) carry nothing to show.
  }
  return files;
}
