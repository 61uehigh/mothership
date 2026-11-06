import { z } from "zod";
import type { Check, CheckOutcome, ChecksSummary } from "@/features/github/model/GitHub";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * ### repoSlugSchema
 *
 * Validates an `owner/name` repository slug from user input.
 */
export const repoSlugSchema = z.string().trim().regex(REPO_PATTERN, "Expected a repository as owner/name");

/**
 * ### optionalString
 *
 * A string `gh` may send as `null` or `""`; both read as `undefined`.
 */
export const optionalString = z
  .string()
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? undefined : v));

/**
 * ### authorSchema
 *
 * `gh`'s author object, read as the login; a deleted account reads as `undefined`.
 */
export const authorSchema = z
  .object({ login: z.string() })
  .nullish()
  .transform((a) => a?.login);

/**
 * ### repositorySchema
 *
 * The repository `gh search` and GraphQL name a result by.
 */
export const repositorySchema = z.object({ nameWithOwner: z.string() });

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

/**
 * ### checksSchema
 *
 * A `statusCheckRollup`: check runs and commit statuses alike, each read as
 * a {@link Check} with one outcome; a missing rollup is no checks.
 */
export const checksSchema = z
  .array(checkSchema)
  .nullish()
  .transform((list) => list ?? []);

/**
 * ### summarizeChecks
 *
 * Counts checks by outcome; the overall state is failure if any failed, else
 * pending if any are still running, else success, and `undefined` without checks.
 */
export function summarizeChecks(checks: Array<Check>): ChecksSummary {
  const failed = checks.filter((c) => c.outcome === "failure").length;
  const pending = checks.filter((c) => c.outcome === "pending").length;
  const passed = checks.filter((c) => c.outcome === "success").length;
  const state = checks.length === 0 ? undefined : failed > 0 ? "failure" : pending > 0 ? "pending" : "success";
  return { total: checks.length, failed, pending, passed, state };
}
