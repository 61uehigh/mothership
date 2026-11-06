import type { PrSummary, PrSummaryView } from "@/features/github/model/PrSummary";
import { getPullRequest, getPullRequestDiff } from "@/features/github/server/pullRequest";
import { summarizePullRequest } from "@/features/github/server/prSummary";
import { SingleFlight } from "@/platform/SingleFlight";
import { SummaryStore } from "@/platform/SummaryStore";

/**
 * ### PrSummaryService
 *
 * Claude's review-oriented summaries of pull requests, saved per head commit.
 * Holds the summaries in progress, so it lives on the shared server state.
 */
export class PrSummaryService {
  // "-v2" retires summaries in the older, longer shape.
  readonly #summaries = new SummaryStore<{ summary: PrSummary; truncated: boolean }>("pr-summaries-v2");
  readonly #summarizing = new SingleFlight<string, PrSummaryView>();

  /**
   * ### summary
   *
   * The saved summary for the PR's current head commit, otherwise a new one
   * (which takes a while). A second request for the same PR waits for the
   * first, unless only the second asks for a fresh summary.
   *
   * @param fresh - Make a new summary even if one is saved.
   * @throws GhError When `gh` fails; Error when Claude does.
   */
  summary(repo: string, number: number, fresh: boolean): Promise<PrSummaryView> {
    const key = `${repo}#${number}`;
    return this.#summarizing.run(`${key}:${fresh}`, async () => {
      const pr = await getPullRequest(repo, number);
      const saved = fresh ? undefined : await this.#summaries.get(key, pr.headRefOid);
      if (saved !== undefined) return { ...saved.value, headRefOid: pr.headRefOid, summarizedAt: saved.at };
      const result = await summarizePullRequest(pr, await getPullRequestDiff(repo, number));
      return { ...result, headRefOid: pr.headRefOid, summarizedAt: await this.#summaries.set(key, pr.headRefOid, result) };
    });
  }
}
