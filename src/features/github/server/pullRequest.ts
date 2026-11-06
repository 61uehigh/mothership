import { z } from "zod";
import { gh, ghJson } from "@/features/github/server/gh";
import { authorSchema, checksSchema, optionalString } from "@/features/github/server/ghSchemas";
import type { PrComment, PullRequest } from "@/features/github/model/GitHub";

const commentSchema = z
  .object({ author: authorSchema, body: z.string(), createdAt: z.string(), url: optionalString })
  .transform((c): PrComment => ({ ...c, reviewState: undefined }));

const reviewSchema = z
  .object({ author: authorSchema, body: z.string(), submittedAt: z.string().nullish(), state: z.string() })
  .transform(
    (r): PrComment => ({ author: r.author, body: r.body, createdAt: r.submittedAt ?? "", reviewState: r.state, url: undefined }),
  );

const PR_VIEW_FIELDS =
  "number,title,body,state,isDraft,author,baseRefName,headRefName,headRefOid,url,mergeable,reviewDecision,statusCheckRollup,reviews,comments,files";

const prViewSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  isDraft: z.boolean(),
  author: authorSchema,
  baseRefName: z.string(),
  headRefName: z.string(),
  headRefOid: z.string(),
  url: z.string(),
  mergeable: z.string(),
  reviewDecision: optionalString,
  statusCheckRollup: checksSchema,
  reviews: z.array(reviewSchema).nullish(),
  comments: z.array(commentSchema).nullish(),
  files: z
    .array(z.object({ path: z.string(), additions: z.number().int(), deletions: z.number().int() }))
    .nullish(),
});

/**
 * ### getPullRequest
 *
 * @throws {@link GhError} When the pull request does not exist or `gh` fails.
 */
export async function getPullRequest(repo: string, number: number): Promise<PullRequest> {
  const pr = await ghJson(["pr", "view", String(number), "--repo", repo, "--json", PR_VIEW_FIELDS], prViewSchema);
  return {
    repo,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    isDraft: pr.isDraft,
    author: pr.author,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    url: pr.url,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision,
    checks: pr.statusCheckRollup,
    reviews: pr.reviews ?? [],
    comments: pr.comments ?? [],
    files: pr.files ?? [],
  };
}

/**
 * ### getPullRequestDiff
 *
 * @returns The pull request's unified diff.
 * @throws {@link GhError} When `gh` fails (including diffs GitHub refuses as too large).
 */
export function getPullRequestDiff(repo: string, number: number): Promise<string> {
  return gh(["pr", "diff", String(number), "--repo", repo, "--color", "never"]);
}
