import { z } from "zod";

/**
 * ### prSummarySchema
 *
 * Claude's reading of a pull request, kept short for a reviewer: what the
 * patch does, its key changes, and where to look hardest. No details.
 */
export const prSummarySchema = z.object({
  /** One sentence: what the patch does and why. */
  gist: z.string(),
  /** The key changes (a notable decision included), most important first; at most three. */
  changes: z.array(z.string()).transform((items) => items.slice(0, 3)),
  /** Where a reviewer should look hardest; at most three. */
  reviewFocus: z.array(z.string()).transform((items) => items.slice(0, 3)),
});

/**
 * ### PrSummary
 *
 * See {@link prSummarySchema}.
 */
export type PrSummary = z.infer<typeof prSummarySchema>;

/**
 * ### PrSummaryView
 *
 * A PR's summary as `GET /api/github/pr/summary` returns it.
 */
export type PrSummaryView = {
  summary: PrSummary;
  /** The head commit summarized; a newer push makes a new summary. */
  headRefOid: string;
  /** Epoch milliseconds the summary was made. */
  summarizedAt: number;
  /** The diff was longer than Claude was shown, so the end of it was left out. */
  truncated: boolean;
};
