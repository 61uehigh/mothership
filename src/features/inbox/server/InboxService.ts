import type { InboxRules, InboxView } from "@/features/inbox/model/Inbox";
import { buildInbox, type InboxInputs } from "@/features/inbox/server/buildInbox";
import { readInboxReview, reviewInbox } from "@/features/inbox/server/inboxReview";
import { errorMessage } from "@/lib/errors";

/**
 * ### InboxDependencies
 *
 * @property inputs - What every source returned; `refresh` loads them fresh instead of from the sidebar's cache.
 * @property today - Today in the dashboard's time zone, `YYYY-MM-DD`; the review is made once a day.
 */
export type InboxDependencies = {
  rules: () => Promise<InboxRules>;
  inputs: (refresh: boolean) => Promise<InboxInputs>;
  today: () => Promise<string>;
};

/**
 * ### InboxService
 *
 * Gathers what needs you from agents, GitHub, Slack, your calendar, and
 * Linear (issues and notifications), sorted by your rules and today's Claude review. Holds the review
 * in progress, so it lives on the shared server state.
 */
export class InboxService {
  readonly #deps: InboxDependencies;
  #reviewing: Promise<void> | undefined;
  #lastReviewError: string | undefined;
  /** The day the automatic review last ran, so a failing one is not retried on every load. */
  #attemptedDay: string | undefined;

  constructor(deps: InboxDependencies) {
    this.#deps = deps;
  }

  /**
   * ### load
   *
   * With the review on and none done today, starts one in the background;
   * the next load shows its moves.
   *
   * @param refresh - Load every source fresh instead of from the sidebar's cache.
   */
  async load(refresh: boolean): Promise<InboxView> {
    const [today, rules, inputs, review] = await Promise.all([this.#deps.today(), this.#deps.rules(), this.#deps.inputs(refresh), readInboxReview()]);
    const current = review?.day === today ? review : undefined;
    const view = buildInbox(inputs, rules, current?.moves ?? {}, Date.now(), today);
    if (rules.claudeReview && current === undefined && this.#attemptedDay !== today && this.#reviewing === undefined && view.items.length > 0) {
      this.#startReview(inputs, rules, today);
    }
    return {
      ...view,
      reviewedAt: current?.at,
      reviewing: this.#reviewing !== undefined,
      reviewError: current === undefined ? this.#lastReviewError : undefined,
    };
  }

  /**
   * ### reviewNow
   *
   * Runs Claude's review now, even if one ran today.
   *
   * @returns The Inbox with the review's moves.
   * @throws Error When Claude's review fails.
   */
  async reviewNow(): Promise<InboxView> {
    const [today, rules, inputs] = await Promise.all([this.#deps.today(), this.#deps.rules(), this.#deps.inputs(false)]);
    const review = await reviewInbox(buildInbox(inputs, rules, {}, Date.now(), today).items, today);
    this.#lastReviewError = undefined;
    return { ...buildInbox(inputs, rules, review.moves, Date.now(), today), reviewedAt: review.at, reviewing: false, reviewError: undefined };
  }

  #startReview(inputs: InboxInputs, rules: InboxRules, today: string): void {
    this.#attemptedDay = today;
    this.#lastReviewError = undefined;
    // Reviewed as the rules sorted them: an older review's moves are not today's.
    const ruled = buildInbox(inputs, rules, {}, Date.now(), today);
    this.#reviewing = reviewInbox(ruled.items, today)
      .then(
        () => undefined,
        (error: unknown) => {
          this.#lastReviewError = errorMessage(error);
          console.error(`[inbox] Claude review failed: ${this.#lastReviewError}`);
        },
      )
      .finally(() => {
        this.#reviewing = undefined;
      });
  }
}
