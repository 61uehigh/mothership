import { describe, expect, it } from "vitest";
import { parseDiff } from "@/ui/parseDiff";

const lines = (...text: Array<string>) => text.join("\n");

describe("parseDiff", () => {
  it("numbers added, deleted, and context lines from the hunk header", () => {
    const [file] = parseDiff(
      lines("diff --git a/src/a.ts b/src/a.ts", "index 1..2 100644", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -10,3 +10,3 @@ function a()", " keep", "-old", "+new", " keep"),
    );
    expect(file).toMatchObject({ path: "src/a.ts", status: "modified", additions: 1, deletions: 1 });
    expect(file.hunks[0].lines).toEqual([
      { kind: "ctx", oldNo: 10, newNo: 10, text: "keep" },
      { kind: "del", oldNo: 11, newNo: undefined, text: "old" },
      { kind: "add", oldNo: undefined, newNo: 11, text: "new" },
      { kind: "ctx", oldNo: 12, newNo: 12, text: "keep" },
    ]);
  });

  it("does not count the ---/+++ headers or a removed line that looks like one", () => {
    const [file] = parseDiff(lines("diff --git a/a.md b/a.md", "--- a/a.md", "+++ b/a.md", "@@ -1,2 +1,1 @@", "--- a rule", " text"));
    expect(file).toMatchObject({ additions: 0, deletions: 1 });
    expect(file.hunks[0].lines[0]).toEqual({ kind: "del", oldNo: 1, newNo: undefined, text: "-- a rule" });
  });

  it("skips the no-newline marker", () => {
    const [file] = parseDiff(lines("diff --git a/a b/a", "@@ -1 +1 @@", "-y", "\\ No newline at end of file", "+z", "\\ No newline at end of file"));
    expect(file.hunks[0].lines.map((l) => l.kind)).toEqual(["del", "add"]);
  });

  it("reads added, deleted, renamed, and binary files, each in diff order", () => {
    const files = parseDiff(
      lines(
        "diff --git a/new.ts b/new.ts",
        "new file mode 100644",
        "@@ -0,0 +1 @@",
        "+hi",
        "diff --git a/gone.ts b/gone.ts",
        "deleted file mode 100644",
        "diff --git a/old name.ts b/new name.ts",
        "similarity index 100%",
        "rename from old name.ts",
        "rename to new name.ts",
        "diff --git a/logo.png b/logo.png",
        "Binary files a/logo.png and b/logo.png differ",
      ),
    );
    expect(files.map(({ path, oldPath, status, binary }) => ({ path, oldPath, status, binary }))).toEqual([
      { path: "new.ts", oldPath: undefined, status: "added", binary: false },
      { path: "gone.ts", oldPath: undefined, status: "deleted", binary: false },
      { path: "new name.ts", oldPath: "old name.ts", status: "renamed", binary: false },
      { path: "logo.png", oldPath: undefined, status: "modified", binary: true },
    ]);
  });

  it("decodes the quoted, octal-escaped paths git writes for Korean file names", () => {
    const [file] = parseDiff(
      lines(
        'diff --git "a/\\355\\225\\234.txt" "b/\\352\\270\\200.txt"',
        "similarity index 50%",
        'rename from "\\355\\225\\234.txt"',
        'rename to "\\352\\270\\200.txt"',
      ),
    );
    expect(file).toMatchObject({ path: "글.txt", oldPath: "한.txt", status: "renamed" });
  });

  it("decodes escaped quotes and backslashes in a quoted path", () => {
    expect(parseDiff('diff --git "a/say \\"hi\\".txt" "b/say \\"hi\\".txt"')[0].path).toBe('say "hi".txt');
  });

  it("ignores text before the first file", () => {
    expect(parseDiff(lines("warning: something", "+not a file"))).toEqual([]);
  });
});
