import { describe, expect, it } from "vitest";
import { nextHunk, nextLine, type LineRef } from "@/features/sessions/ui/review/reviewCursor";

// Two files: the first has hunks 0 (a, b) and 1 (c); the second has hunk 0 (d, e).
const lines: Array<LineRef> = [
  { id: "a", file: 0, hunk: 0 },
  { id: "b", file: 0, hunk: 0 },
  { id: "c", file: 0, hunk: 1 },
  { id: "d", file: 1, hunk: 0 },
  { id: "e", file: 1, hunk: 0 },
];

describe("nextLine", () => {
  it("starts at the first line when nothing is selected", () => {
    expect(nextLine(lines, undefined, 1)).toBe("a");
    expect(nextLine(lines, undefined, -1)).toBe("a");
  });

  it("stays on the last line at the end of the diff", () => {
    expect(nextLine(lines, "e", 1)).toBe("e");
  });

  it("starts over from the top when the selected line is gone after a reload", () => {
    expect(nextLine(lines, "gone", 1)).toBe("a");
  });

  it("finds nothing in an empty diff", () => {
    expect(nextLine([], undefined, 1)).toBeUndefined();
  });
});

describe("nextHunk", () => {
  it("goes to the first hunk when nothing is selected", () => {
    expect(nextHunk(lines, undefined, 1)).toBe("a");
    expect(nextHunk(lines, undefined, -1)).toBeUndefined();
  });

  it("moves to the next hunk in another file", () => {
    expect(nextHunk(lines, "c", 1)).toBe("d");
  });

  it("moves to the previous hunk from a hunk's first line", () => {
    expect(nextHunk(lines, "d", -1)).toBe("c");
    expect(nextHunk(lines, "b", 1)).toBe("c");
  });

  it("goes back to the hunk before, not the start of its own hunk, from inside a hunk", () => {
    expect(nextHunk(lines, "e", -1)).toBe("c");
  });

  it("finds nothing past the last hunk", () => {
    expect(nextHunk(lines, "e", 1)).toBeUndefined();
  });

  it("treats a selected line that is gone after a reload like no selection", () => {
    expect(nextHunk(lines, "gone", 1)).toBe("a");
  });

  it("keeps hunks of a file with many hunks in file order", () => {
    const many: Array<LineRef> = [
      { id: "x", file: 0, hunk: 2_000_000 },
      { id: "y", file: 1, hunk: 0 },
    ];
    expect(nextHunk(many, "x", 1)).toBe("y");
  });
});
