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
const QUOTED_NEW_PATH = / "b\/((?:[^"\\]|\\.)*)"$/;
const NEW_PATH = / b\/(.*)$/;
const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/**
 * A path as git wrote it. Git puts a path with non-ASCII characters (a
 * Korean file name, say) or quotes in C-style quotes, its UTF-8 bytes as
 * octal escapes: `"\355\225\234.txt"` is `한.txt`.
 */
function unquote(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path;
  const chars = Array.from(path.slice(1, -1));
  const bytes: Array<number> = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "\\") {
      bytes.push(...encoder.encode(chars[i]));
    } else if (/^[0-7]$/.test(chars[i + 1] ?? "")) {
      bytes.push(parseInt(chars.slice(i + 1, i + 4).join(""), 8));
      i += 3;
    } else {
      bytes.push(ESCAPES[chars[i + 1]] ?? chars[i + 1].charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The new path from a `diff --git a/… b/…` line, quoted or not. */
function newPath(header: string): string | undefined {
  const quoted = QUOTED_NEW_PATH.exec(header);
  if (quoted !== null) return unquote(`"${quoted[1]}"`);
  return NEW_PATH.exec(header)?.[1];
}

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
      file = { path: newPath(line) ?? line, oldPath: undefined, status: "modified", binary: false, additions: 0, deletions: 0, hunks: [] };
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
      file.oldPath = unquote(line.slice("rename from ".length));
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
