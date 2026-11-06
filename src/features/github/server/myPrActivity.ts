import { z } from "zod";
import { ghJson } from "@/features/github/server/gh";
import { repositorySchema } from "@/features/github/server/ghSchemas";
import { processState } from "@/platform/processState";

/** As long as the overview's cache, so the Inbox's statuses match the GitHub section. */
const STATUS_TTL_MS = 60_000;

const MY_PR_STATUS_QUERY = `query {
  search(query: "is:pr is:open author:@me", type: ISSUE, first: 50) {
    nodes { ... on PullRequest { number reviewDecision repository { nameWithOwner } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } }
  }
}`;
const myPrStatusSchema = z.object({
  data: z.object({
    search: z.object({
      nodes: z.array(
        z.object({
          number: z.number().int().optional(),
          reviewDecision: z.string().nullish(),
          repository: repositorySchema.optional(),
          commits: z.object({ nodes: z.array(z.object({ commit: z.object({ statusCheckRollup: z.object({ state: z.string() }).nullish() }) })) }).optional(),
        }),
      ),
    }),
  }),
});
const myPrStatusCache = processState("github.myPrStatuses", () => ({ value: undefined as { at: number; statuses: Map<string, MyPrStatus> } | undefined }));

/**
 * ### MyPrStatus
 *
 * Your open pull request's checks and review, for the Inbox.
 */
export type MyPrStatus = { failing: boolean; changesRequested: boolean };

/**
 * ### myPrStatuses
 *
 * Checks and review decisions of your open pull requests in every
 * repository, in one GraphQL call (search results carry neither). Cached for
 * a minute, like the overview.
 *
 * @param refresh - Bypass the cache.
 * @returns By `owner/name#number`.
 * @throws {@link GhError} When `gh` fails.
 */
export async function myPrStatuses(refresh: boolean): Promise<Map<string, MyPrStatus>> {
  const cached = myPrStatusCache.value;
  if (!refresh && cached !== undefined && Date.now() - cached.at < STATUS_TTL_MS) return cached.statuses;
  const result = await ghJson(["api", "graphql", "-f", `query=${MY_PR_STATUS_QUERY}`], myPrStatusSchema);
  const statuses = new Map<string, MyPrStatus>();
  for (const node of result.data.search.nodes) {
    if (node.number === undefined || node.repository === undefined) continue;
    const state = node.commits?.nodes[0]?.commit.statusCheckRollup?.state;
    statuses.set(`${node.repository.nameWithOwner}#${node.number}`, {
      failing: state === "FAILURE" || state === "ERROR",
      changesRequested: node.reviewDecision === "CHANGES_REQUESTED",
    });
  }
  myPrStatusCache.value = { at: Date.now(), statuses };
  return statuses;
}

const searchedPrSchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    url: z.string(),
    createdAt: z.string(),
    closedAt: z.string().nullish(),
    repository: z.object({ nameWithOwner: z.string() }),
  }),
);

/**
 * ### MyPrEvent
 *
 * A pull request of yours opened or merged in a time range.
 */
export type MyPrEvent = { what: "opened" | "merged"; repo: string; number: number; title: string; url: string; at: number };

const PR_EVENT_LIMIT = 50;

/** GitHub search takes ISO times with an offset; local time keeps the range on your day. */
function isoWithOffset(epochMs: number): string {
  const date = new Date(epochMs);
  const offset = -date.getTimezoneOffset();
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const local = new Date(epochMs + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${offset >= 0 ? "+" : "-"}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/**
 * ### myPrEvents
 *
 * Your pull requests, in every repository, opened or merged in `[from, to)`
 * (two `gh search` calls). Search has no merge time, so a merge is dated by
 * when the pull request closed, which is the same moment.
 *
 * @throws {@link GhError} When `gh` fails.
 */
export async function myPrEvents(from: number, to: number): Promise<Array<MyPrEvent>> {
  const range = `${isoWithOffset(from)}..${isoWithOffset(to - 1000)}`;
  const fields = ["--json", "number,title,url,createdAt,closedAt,repository", "--limit", String(PR_EVENT_LIMIT)];
  const [opened, merged] = await Promise.all([
    ghJson(["search", "prs", "--author", "@me", "--created", range, ...fields], searchedPrSchema),
    ghJson(["search", "prs", "--author", "@me", "--merged-at", range, ...fields], searchedPrSchema),
  ]);
  const event = (what: MyPrEvent["what"], at: string | null | undefined, pr: z.infer<typeof searchedPrSchema>[number]): MyPrEvent => ({
    what,
    repo: pr.repository.nameWithOwner,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    at: Date.parse(at ?? pr.createdAt),
  });
  return [...opened.map((pr) => event("opened", pr.createdAt, pr)), ...merged.map((pr) => event("merged", pr.closedAt, pr))];
}
