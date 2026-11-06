import { z } from "zod";
import { ghJson } from "@/features/github/server/gh";
import { authorSchema, checksSchema, optionalString, repositorySchema, summarizeChecks } from "@/features/github/server/ghSchemas";
import { ALL_REPOSITORIES, type IssueListItem, type Overview, type PrListItem, type RunListItem } from "@/features/github/model/GitHub";
import { processState } from "@/platform/processState";

const OVERVIEW_TTL_MS = 60_000;
const RUN_LIMIT = 10;
const LIST_LIMIT = 50;

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
    .transform(({ statusCheckRollup, ...rest }): PrListItem => ({ ...rest, checks: summarizeChecks(statusCheckRollup) })),
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

const overviewCache = processState("github.overview", () => new Map<string, Overview>());

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
