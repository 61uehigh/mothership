import { z } from "zod";
import { gh, ghJson } from "@/features/github/server/gh";
import {
  ALL_REPOSITORIES,
  type Check,
  type CheckOutcome,
  type ChecksSummary,
  type IssueListItem,
  type Overview,
  type PrComment,
  type PrListItem,
  type PullRequest,
  type RunListItem,
} from "@/features/github/model/GitHub";

const OVERVIEW_TTL_MS = 60_000;
const RUN_LIMIT = 10;
const LIST_LIMIT = 50;

/**
 * ### REPO_PATTERN
 *
 * Shape of an `owner/name` repository slug.
 */
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * ### repoSlugSchema
 *
 * Validates an `owner/name` repository slug from user input.
 */
export const repoSlugSchema = z.string().trim().regex(REPO_PATTERN, "Expected a repository as owner/name");

// --- Public shapes -------------------------------------------------------

// --- gh output schemas ---------------------------------------------------

const optionalString = z
  .string()
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? undefined : v));

const authorSchema = z
  .object({ login: z.string() })
  .nullish()
  .transform((a) => a?.login);

const checkRunSchema = z.object({
  __typename: z.literal("CheckRun"),
  name: z.string(),
  workflowName: optionalString,
  status: z.string(),
  conclusion: optionalString,
  detailsUrl: optionalString,
});

const statusContextSchema = z.object({
  __typename: z.literal("StatusContext"),
  context: z.string(),
  state: z.string(),
  targetUrl: optionalString,
});

const FAILED = new Set(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);
const PASSED = new Set(["SUCCESS"]);

const checkSchema = z.discriminatedUnion("__typename", [checkRunSchema, statusContextSchema]).transform((raw): Check => {
  if (raw.__typename === "CheckRun") {
    const conclusion = raw.conclusion?.toUpperCase();
    const outcome: CheckOutcome =
      raw.status.toUpperCase() !== "COMPLETED"
        ? "pending"
        : conclusion !== undefined && FAILED.has(conclusion)
          ? "failure"
          : conclusion !== undefined && PASSED.has(conclusion)
            ? "success"
            : "neutral";
    return { name: raw.name, workflowName: raw.workflowName, status: raw.status, conclusion: raw.conclusion, detailsUrl: raw.detailsUrl, outcome };
  }
  const state = raw.state.toUpperCase();
  const outcome: CheckOutcome = FAILED.has(state) ? "failure" : PASSED.has(state) ? "success" : "pending";
  return {
    name: raw.context,
    workflowName: undefined,
    status: raw.state,
    conclusion: outcome === "pending" ? undefined : raw.state,
    detailsUrl: raw.targetUrl,
    outcome,
  };
});

const checksSchema = z
  .array(checkSchema)
  .nullish()
  .transform((list) => list ?? []);

function summarize(checks: Array<Check>): ChecksSummary {
  const failed = checks.filter((c) => c.outcome === "failure").length;
  const pending = checks.filter((c) => c.outcome === "pending").length;
  const passed = checks.filter((c) => c.outcome === "success").length;
  const state = checks.length === 0 ? undefined : failed > 0 ? "failure" : pending > 0 ? "pending" : "success";
  return { total: checks.length, failed, pending, passed, state };
}

const PR_LIST_FIELDS = "number,title,url,state,isDraft,updatedAt,author,headRefName,statusCheckRollup";

const prListSchema = z.array(
  z
    .object({
      number: z.number().int(),
      title: z.string(),
      url: z.string(),
      state: z.string(),
      isDraft: z.boolean(),
      updatedAt: z.string(),
      author: authorSchema,
      headRefName: z.string(),
      statusCheckRollup: checksSchema,
    })
    .transform(({ statusCheckRollup, ...rest }): PrListItem => ({ ...rest, checks: summarize(statusCheckRollup) })),
);

const issueListSchema = z.array(
  z
    .object({
      number: z.number().int(),
      title: z.string(),
      url: z.string(),
      state: z.string(),
      updatedAt: z.string(),
      author: authorSchema,
    })
    .transform((issue): IssueListItem => issue),
);

const runListSchema = z.array(
  z
    .object({
      databaseId: z.number().int(),
      workflowName: optionalString,
      name: optionalString,
      displayTitle: z.string(),
      status: z.string(),
      conclusion: optionalString,
      headBranch: z.string(),
      event: z.string(),
      url: z.string(),
      updatedAt: z.string(),
    })
    .transform(
      (r): RunListItem => ({
        id: r.databaseId,
        name: r.workflowName ?? r.name ?? "Workflow",
        title: r.displayTitle,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.headBranch,
        event: r.event,
        url: r.url,
        updatedAt: r.updatedAt,
      }),
    ),
);

const commentSchema = z
  .object({ author: authorSchema, body: z.string(), createdAt: z.string(), url: optionalString })
  .transform((c): PrComment => ({ ...c, reviewState: undefined }));

const reviewSchema = z
  .object({ author: authorSchema, body: z.string(), submittedAt: z.string().nullish(), state: z.string() })
  .transform(
    (r): PrComment => ({ author: r.author, body: r.body, createdAt: r.submittedAt ?? "", reviewState: r.state, url: undefined }),
  );

const PR_VIEW_FIELDS =
  "number,title,body,state,isDraft,author,baseRefName,headRefName,url,mergeable,reviewDecision,statusCheckRollup,reviews,comments,files";

const prViewSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  isDraft: z.boolean(),
  author: authorSchema,
  baseRefName: z.string(),
  headRefName: z.string(),
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

// --- Overview ------------------------------------------------------------

const overviewCache = new Map<string, Overview>();

/**
 * ### getOverview
 *
 * The logged-in user's pull requests, review requests, assigned issues, and
 * the latest workflow runs in `repo`. Cached per repository for a minute.
 *
 * @param refresh - Bypass the cache.
 * @throws {@link GhError} When any `gh` call fails.
 */
export async function getOverview(repo: string, refresh: boolean): Promise<Overview> {
  const cached = overviewCache.get(repo);
  if (!refresh && cached !== undefined && Date.now() - cached.fetchedAt < OVERVIEW_TTL_MS) return cached;

  const limit = String(LIST_LIMIT);
  const [myPullRequests, reviewRequests, assignedIssues, runs] = await Promise.all([
    ghJson(["pr", "list", "--repo", repo, "--author", "@me", "--limit", limit, "--json", PR_LIST_FIELDS], prListSchema),
    ghJson(
      ["pr", "list", "--repo", repo, "--search", "review-requested:@me", "--limit", limit, "--json", PR_LIST_FIELDS],
      prListSchema,
    ),
    ghJson(
      ["issue", "list", "--repo", repo, "--assignee", "@me", "--limit", limit, "--json", "number,title,url,state,updatedAt,author"],
      issueListSchema,
    ),
    ghJson(
      [
        "run",
        "list",
        "--repo",
        repo,
        "--limit",
        String(RUN_LIMIT),
        "--json",
        "databaseId,workflowName,name,displayTitle,status,conclusion,headBranch,event,url,updatedAt",
      ],
      runListSchema,
    ),
  ]);
  const overview: Overview = { repo, myPullRequests, reviewRequests, assignedIssues, runs, fetchedAt: Date.now() };
  overviewCache.set(repo, overview);
  return overview;
}

const SEARCH_FIELDS = "number,title,url,state,updatedAt,author,repository";
const repositorySchema = z.object({ nameWithOwner: z.string() });
const searchPrSchema = z.array(
  z
    .object({
      number: z.number().int(),
      title: z.string(),
      url: z.string(),
      state: z.string(),
      isDraft: z.boolean(),
      updatedAt: z.string(),
      author: authorSchema,
      repository: repositorySchema,
    })
    .transform(({ repository, state, ...rest }): PrListItem => ({
      ...rest,
      // `gh search` answers in lower case; `gh pr list` (and the icons) use upper case.
      state: state.toUpperCase(),
      headRefName: "",
      // Search results carry no check status.
      checks: { total: 0, failed: 0, pending: 0, passed: 0, state: undefined },
      repo: repository.nameWithOwner,
    })),
);
const searchIssueSchema = z.array(
  z
    .object({
      number: z.number().int(),
      title: z.string(),
      url: z.string(),
      state: z.string(),
      updatedAt: z.string(),
      author: authorSchema,
      repository: repositorySchema,
    })
    .transform(({ repository, state, ...rest }): IssueListItem => ({ ...rest, state: state.toUpperCase(), repo: repository.nameWithOwner })),
);

/**
 * ### getAllOverview
 *
 * Your open pull requests, open review requests, and open assigned issues in
 * every repository on GitHub, newest first, through `gh search`. Cached for
 * a minute like {@link getOverview}.
 *
 * @param refresh - Bypass the cache.
 * @throws {@link GhError} When any `gh` call fails.
 */
export async function getAllOverview(refresh: boolean): Promise<Overview> {
  const cached = overviewCache.get(ALL_REPOSITORIES);
  if (!refresh && cached !== undefined && Date.now() - cached.fetchedAt < OVERVIEW_TTL_MS) return cached;
  const common = ["--state", "open", "--limit", String(LIST_LIMIT), "--sort", "updated"];
  const [myPullRequests, reviewRequests, assignedIssues] = await Promise.all([
    ghJson(["search", "prs", "--author", "@me", ...common, "--json", `${SEARCH_FIELDS},isDraft`], searchPrSchema),
    ghJson(["search", "prs", "--review-requested", "@me", ...common, "--json", `${SEARCH_FIELDS},isDraft`], searchPrSchema),
    ghJson(["search", "issues", "--assignee", "@me", ...common, "--json", SEARCH_FIELDS], searchIssueSchema),
  ]);
  const overview: Overview = { repo: ALL_REPOSITORIES, myPullRequests, reviewRequests, assignedIssues, runs: [], fetchedAt: Date.now() };
  overviewCache.set(ALL_REPOSITORIES, overview);
  return overview;
}

// --- Pull request --------------------------------------------------------

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
