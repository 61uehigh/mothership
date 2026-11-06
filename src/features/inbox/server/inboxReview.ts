import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { INBOX_BUCKETS, type InboxItem } from "@/features/inbox/model/Inbox";
import { askClaudeJson } from "@/platform/askClaude";
import { dataPath } from "@/platform/paths";

const file = () => dataPath(".mothership", "inbox-review.json");
/** Items sent to Claude at most, newest first. */
const REVIEW_MAX_ITEMS = 80;
/** A review that takes longer than this is stopped, so it never blocks the next one. */
const REVIEW_TIMEOUT_MS = 90_000;

const reviewSchema = z.object({
  /** Your local date of the review, `YYYY-MM-DD`; a review counts for that day only. */
  day: z.string(),
  at: z.number(),
  moves: z.record(z.string(), z.object({ bucket: z.enum(INBOX_BUCKETS), why: z.string() })),
});

/**
 * ### InboxReview
 *
 * Claude's moves for one day, by item id.
 */
export type InboxReview = z.infer<typeof reviewSchema>;

/**
 * ### readInboxReview
 *
 * @returns The last review, or `undefined` when there is none (or it is unreadable).
 */
export async function readInboxReview(): Promise<InboxReview | undefined> {
  try {
    return reviewSchema.parse(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    return undefined;
  }
}

const answerSchema = z.object({
  moves: z.array(z.object({ id: z.string(), bucket: z.enum(["today", "week", "month"]), why: z.string().max(120) })),
});

function prompt(items: Array<InboxItem>, today: string, now: number): string {
  const lines = items.map((item) =>
    JSON.stringify({
      id: item.id,
      source: item.source,
      title: item.title.slice(0, 160),
      context: item.subtitle?.slice(0, 120),
      bucket: item.bucket,
      rule: item.reason,
      ageHours: item.at === undefined ? undefined : Math.round((now - item.at) / 3_600_000),
    }),
  );
  return [
    `Today is ${today}. Below is a person's work inbox, already sorted by fixed rules into "today", "week" (this week), and "month" (this month).`,
    "Move only the items the rules clearly got wrong, judging by the title and context: something urgent or blocking others belongs in today; routine updates, FYIs, or automated messages can wait.",
    "Leave everything else alone. Moving nothing is a fine answer.",
    'Answer with JSON only, no prose: {"moves":[{"id":"…","bucket":"today|week|month","why":"under 10 words"}]}',
    "",
    ...lines,
  ].join("\n");
}

/**
 * ### reviewInbox
 *
 * Asks Claude (Haiku, no tools) which rule-sorted items to move, and saves
 * its answer as today's review.
 *
 * @param today - Your local date, `YYYY-MM-DD`.
 * @throws Error When Claude cannot be reached or does not answer in the expected shape.
 */
export async function reviewInbox(items: Array<InboxItem>, today: string): Promise<InboxReview> {
  const now = Date.now();
  // Judged as the rules sorted them, not as an earlier review moved them.
  const candidates = items.filter((item) => item.bucket !== "hidden").slice(0, REVIEW_MAX_ITEMS);
  const answer = await askClaudeJson(prompt(candidates, today, now), answerSchema, { what: "Claude's review", model: "haiku", timeoutMs: REVIEW_TIMEOUT_MS });
  const known = new Set(candidates.map((item) => item.id));
  const moves: InboxReview["moves"] = {};
  for (const move of answer.moves) {
    if (known.has(move.id)) moves[move.id] = { bucket: move.bucket, why: move.why };
  }
  const review: InboxReview = { day: today, at: now, moves };
  await mkdir(path.dirname(file()), { recursive: true });
  await writeFile(file(), `${JSON.stringify(review, null, 2)}\n`);
  return review;
}
