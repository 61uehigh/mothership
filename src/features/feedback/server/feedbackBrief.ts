import type { FeedbackInput } from "@/features/feedback/model/Feedback";

/**
 * ### FeedbackContext
 *
 * What the server adds to the page's feedback before handing it to a session.
 */
export type FeedbackContext = {
  /** Where the screenshot was saved, when there is one. */
  screenshotPath: string | undefined;
  /** The checkout's current commit, e.g. `8d57241 feat: …`. */
  commit: string | undefined;
  /** The last lines of the server log. */
  logTail: Array<string>;
};

const fence = (lines: Array<string>) => ["```", ...lines, "```"].join("\n");

/**
 * ### feedbackTitle
 *
 * @returns A session name from the feedback's first line, e.g. "Feedback: make the Slack reply box taller".
 */
export function feedbackTitle(text: string): string {
  const first = text.trim().split("\n")[0] ?? "";
  return `Feedback: ${first.length <= 60 ? first : `${first.slice(0, 59).trimEnd()}…`}`;
}

/**
 * ### feedbackBrief
 *
 * The first message of a feedback session: the request, where it applies,
 * and the evidence, with how to work on mothership's own code.
 */
export function feedbackBrief(input: FeedbackInput, context: FeedbackContext): string {
  const where = [
    `- Open tab: \`${input.screen}\``,
    ...(input.target === undefined
      ? ["- No element picked: the feedback is about the screen as a whole."]
      : [
          `- Picked element in area \`${input.target.area}\``,
          `  - CSS path: \`${input.target.path}\``,
          ...(input.target.label === "" ? [] : [`  - Name: ${JSON.stringify(input.target.label)}`]),
          ...(input.target.text === "" ? [] : [`  - Text: ${JSON.stringify(input.target.text)}`]),
        ]),
    `- Window: ${input.viewport.width}×${input.viewport.height}, ${input.viewport.theme} theme`,
    ...(context.screenshotPath === undefined ? [] : [`- Screenshot: ${context.screenshotPath} (open it with Read to see what the human saw)`]),
    ...(context.commit === undefined ? [] : [`- Checkout was at: ${context.commit}`]),
  ];
  return [
    "The human, using mothership, left feedback on mothership's own screen. You are working on mothership's source code in your own worktree.",
    "",
    "## What they want",
    input.text,
    "",
    "## Where",
    ...where,
    "",
    "## Errors in the page just before",
    input.pageErrors.length === 0 ? "None." : fence(input.pageErrors),
    "",
    "## Server log (last lines)",
    context.logTail.length === 0 ? "Empty." : fence(context.logTail),
    "",
    "## How to work",
    "- Start from the area and the text above to find the component (`data-usage-area` names the screen areas). `docs/ARCHITECTURE.md` explains the layout of the code.",
    "- Make the smallest change that does what they asked, in the style of the code around it.",
    "- Run `pnpm lint` and `pnpm test` before you finish, and fix what they report.",
    "- Do not commit. Report what you changed and how to see it; the human reviews the changes and merges them.",
    "- If the request is unclear, ask before changing much.",
  ].join("\n");
}
