import type { DiffLine } from "@/ui/parseDiff";

/**
 * ### ReviewComment
 *
 * A comment on one diff line, keyed by `lineId`.
 */
export type ReviewComment = { key: string; path: string; line: DiffLine; text: string };

/**
 * ### lineId
 *
 * Identifies a line by file and line numbers rather than by position, so a
 * pending comment and the cursor stay on the same line when the diff reloads
 * after the agent's next turn.
 */
export const lineId = (path: string, line: DiffLine) => `${path}|${line.kind}|${line.oldNo ?? ""}|${line.newNo ?? ""}`;

/**
 * ### reviewMessage
 *
 * The message that sends a review to the agent: a request line, the overall
 * comment, then each line comment with its location and the line quoted.
 * Empty parts are left out.
 */
export function reviewMessage(comments: Array<ReviewComment>, summary: string): string {
  const body = comments.map((c) => {
    const lineNo = c.line.newNo ?? c.line.oldNo;
    const sign = c.line.kind === "add" ? "+" : c.line.kind === "del" ? "-" : " ";
    return `${c.path}:${lineNo}\n    ${sign} ${c.line.text.trim()}\n  → ${c.text}`;
  });
  return ["[Code review] Please address the comments below.", summary.trim(), ...body].filter((part) => part !== "").join("\n\n");
}
