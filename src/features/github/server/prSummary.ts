import { prSummarySchema, type PrSummary } from "@/features/github/model/PrSummary";
import type { PullRequest } from "@/features/github/model/GitHub";
import { askClaudeJson } from "@/platform/askClaude";

/** Characters of diff sent to Claude at most. */
const DIFF_MAX_CHARS = 150_000;
const SUMMARY_TIMEOUT_MS = 180_000;

function prompt(pr: PullRequest, diff: string): string {
  const files = pr.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join("\n");
  return [
    `Below is pull request #${pr.number} "${pr.title}" in ${pr.repo} (${pr.headRefName} → ${pr.baseRefName}), with its description, changed files, and diff.`,
    "Tell a reviewer, at a glance, what this patch is and where to look. Headlines only: they will read the diff for the rest.",
    "Write in the language of the PR description (Korean if it is Korean); keep code names as they are.",
    "- gist: ONE sentence, at most 80 characters (40 in Korean): what the patch does, in plain words.",
    "- changes: 1 to 3 headline changes, most important first, a notable decision included if there is one.",
    "- reviewFocus: 1 to 3 things to check hardest (risky logic, a behaviour change, an edge case, a missing test).",
    "Every item is ONE line of at most 60 characters (30 in Korean), with at most one code name.",
    "Say what, never how: no mechanisms, numbers, defaults, config values, call chains, or lists of names.",
    "Fewer items are better than filler; a small PR may have one of each.",
    'Answer with JSON only, no prose: {"gist":"…","changes":["…"],"reviewFocus":["…"]}',
    "",
    "## Description",
    pr.body.trim() || "(none)",
    "",
    "## Files",
    files,
    "",
    "## Diff",
    diff.slice(0, DIFF_MAX_CHARS),
  ].join("\n");
}

/**
 * ### summarizePullRequest
 *
 * Asks Claude (Sonnet, no tools) for a review-oriented summary of a PR.
 *
 * @returns The summary, and whether the diff was cut to fit.
 * @throws Error When Claude cannot be reached or does not answer in the expected shape.
 */
export async function summarizePullRequest(pr: PullRequest, diff: string): Promise<{ summary: PrSummary; truncated: boolean }> {
  const summary = await askClaudeJson(prompt(pr, diff), prSummarySchema, { what: "Claude's PR summary", model: "sonnet", timeoutMs: SUMMARY_TIMEOUT_MS });
  return { summary, truncated: diff.length > DIFF_MAX_CHARS };
}
