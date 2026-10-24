// GitHub data shared by the server (features/github/server) and the UI.

/**
 * ### LocalRepo
 *
 * A GitHub repository with a local checkout.
 */
export type LocalRepo = {
  /** `owner/name`. */
  repo: string;
  /** A local directory whose `origin` points at the repository; `undefined` for one added from your account. */
  dir: string | undefined;
  /** `local`: found in a folder you work in. `added`: picked from your GitHub account. */
  source: "local" | "added";
};

/**
 * ### RepoList
 *
 * Response of `GET /api/github/repos`.
 */
export type RepoList = {
  /** Shown in the GitHub section: added ones and local ones you have not removed. */
  repos: Array<LocalRepo>;
  /** Local repositories you removed, so they can be put back. */
  hidden: Array<string>;
};

/**
 * ### AccountRepo
 *
 * A repository you can reach on GitHub (yours or an organization's), offered
 * when adding repositories to the GitHub section.
 */
export type AccountRepo = {
  /** `owner/name`. */
  repo: string;
  description: string | undefined;
  isPrivate: boolean;
  /** ISO 8601. */
  updatedAt: string;
};

/**
 * ### CheckOutcome
 *
 * A check's state reduced to what a status dot needs.
 */
export type CheckOutcome = "success" | "failure" | "pending" | "neutral";

/**
 * ### Check
 *
 * One CI check (a check run or a commit status) on a pull request.
 */
export type Check = {
  name: string;
  /** Workflow that produced a check run, when known. */
  workflowName: string | undefined;
  /** GitHub's raw status, e.g. `COMPLETED`, `IN_PROGRESS`, `PENDING`. */
  status: string;
  /** GitHub's raw conclusion, e.g. `SUCCESS`, `FAILURE`; `undefined` while running. */
  conclusion: string | undefined;
  detailsUrl: string | undefined;
  outcome: CheckOutcome;
};

/**
 * ### ChecksSummary
 *
 * Counts per {@link CheckOutcome}, plus the overall state for a list row.
 */
export type ChecksSummary = {
  total: number;
  failed: number;
  pending: number;
  passed: number;
  /** `failure` if any failed, else `pending` if any run, else `success`; `undefined` with no checks. */
  state: "success" | "failure" | "pending" | undefined;
};

/**
 * ### PrListItem
 *
 * A pull request row in the GitHub pane.
 */
export type PrListItem = {
  number: number;
  title: string;
  url: string;
  /** `OPEN`, `CLOSED`, or `MERGED`. */
  state: string;
  isDraft: boolean;
  /** ISO 8601. */
  updatedAt: string;
  author: string | undefined;
  headRefName: string;
  checks: ChecksSummary;
  /** `owner/name`; set in the all-repositories view, where rows come from many repositories. */
  repo?: string;
};

/**
 * ### IssueListItem
 *
 * An issue row in the GitHub pane.
 */
export type IssueListItem = {
  number: number;
  title: string;
  url: string;
  state: string;
  /** ISO 8601. */
  updatedAt: string;
  author: string | undefined;
  /** `owner/name`; set in the all-repositories view. */
  repo?: string;
};

/**
 * ### RunListItem
 *
 * A workflow run row in the GitHub pane.
 */
export type RunListItem = {
  id: number;
  /** Workflow name. */
  name: string;
  /** Commit or PR title that triggered the run. */
  title: string;
  /** `queued`, `in_progress`, `completed`, … */
  status: string;
  /** `success`, `failure`, `cancelled`, …; `undefined` while running. */
  conclusion: string | undefined;
  branch: string;
  event: string;
  url: string;
  /** ISO 8601. */
  updatedAt: string;
};

/**
 * ### Overview
 *
 * Everything the GitHub pane shows for one repository.
 */
export type Overview = {
  /** `owner/name`, or {@link ALL_REPOSITORIES} for the view across every repository. */
  repo: string;
  /** Open pull requests authored by the logged-in user. */
  myPullRequests: Array<PrListItem>;
  /** Open pull requests requesting the logged-in user's review. */
  reviewRequests: Array<PrListItem>;
  /** Open issues assigned to the logged-in user. */
  assignedIssues: Array<IssueListItem>;
  runs: Array<RunListItem>;
  /** Epoch milliseconds when this was fetched from GitHub. */
  fetchedAt: number;
};

/**
 * ### PrComment
 *
 * A conversation entry: an issue comment or a review.
 */
export type PrComment = {
  author: string | undefined;
  body: string;
  /** ISO 8601. */
  createdAt: string;
  /** Review state (`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, …); `undefined` for plain comments. */
  reviewState: string | undefined;
  url: string | undefined;
};

/**
 * ### PrFile
 *
 * A changed file with line counts.
 */
export type PrFile = { path: string; additions: number; deletions: number };

/**
 * ### PullRequest
 *
 * Details of one pull request.
 */
export type PullRequest = {
  repo: string;
  number: number;
  title: string;
  body: string;
  state: string;
  isDraft: boolean;
  author: string | undefined;
  baseRefName: string;
  headRefName: string;
  url: string;
  /** `MERGEABLE`, `CONFLICTING`, or `UNKNOWN`. */
  mergeable: string;
  /** `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`; `undefined` when no review is required. */
  reviewDecision: string | undefined;
  checks: Array<Check>;
  reviews: Array<PrComment>;
  comments: Array<PrComment>;
  files: Array<PrFile>;
};

/**
 * ### GhErrorCode
 *
 * Why a `gh` call failed:
 * - `missing`: the GitHub CLI is not installed.
 * - `auth`: it is installed but not logged in.
 * - `failed`: anything else (unknown repository, network, invalid output).
 */
export type GhErrorCode = "missing" | "auth" | "failed";

/**
 * ### ALL_REPOSITORIES
 *
 * The GitHub section's choice that shows your pull requests, review requests,
 * and assigned issues across every repository on GitHub (not only those with
 * a local checkout). Workflow runs are per repository, so it has none.
 */
export const ALL_REPOSITORIES = "*";
