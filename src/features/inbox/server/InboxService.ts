import { isUnread, type InboxItem, type InboxRules, type InboxView, type ReviewFailure } from "@/features/inbox/model/Inbox";
import { applyReview, buildInbox, type InboxInputs } from "@/features/inbox/server/buildInbox";
import { readInboxReview, reviewInbox } from "@/features/inbox/server/inboxReview";
import type { InboxReadStore } from "@/features/inbox/server/InboxReadStore";
import { HttpError } from "@/platform/http/HttpError";
import { errorMessage } from "@/lib/errors";
import { zonedDate, zonedMidnight } from "@/lib/dates";

/**
 * ### InboxDependencies
 *
 * @property inputs - What every source returned; `refresh` loads them fresh instead of from the sidebar's cache.
 * @property timeZone - The dashboard's IANA zone: what "today" (the review is made once a day) and "this month" mean.
 * @property reads - Which items you have read.
 * @property markLinear - Marks notifications read or unread in Linear itself; throws when that fails.
 */
export type InboxDependencies = {
  rules: () => Promise<InboxRules>;
  inputs: (refresh: boolean) => Promise<InboxInputs>;
  timeZone: () => Promise<string>;
  reads: InboxReadStore;
  markLinear: (ids: Array<string>, read: boolean) => Promise<void>;
};

/**
 * ### InboxService
 *
 * Gathers what needs you from agents, GitHub, Slack, your calendar,
 * Linear (issues and notifications), and Gmail (unread mail), sorted by your rules and today's Claude review. Holds the review
 * in progress, so it lives on the shared server state.
 */
export class InboxService {
  readonly #deps: InboxDependencies;
  #reviewing: Promise<void> | undefined;
  #lastReviewError: ReviewFailure | undefined;
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
    const [{ today, monthStart }, rules, inputs, review] = await Promise.all([this.#calendar(), this.#deps.rules(), this.#deps.inputs(refresh), readInboxReview()]);
    const current = review?.day === today ? review : undefined;
    const ruled = buildInbox(inputs, rules, Date.now(), today);
    if (rules.claudeReview && current === undefined && this.#attemptedDay !== today && this.#reviewing === undefined && ruled.items.length > 0) {
      this.#startReview(ruled.items, today);
    }
    return {
      ...ruled,
      monthStart,
      items: await this.#withReadState(applyReview(ruled.items, current?.moves ?? {})),
      reviewedAt: current?.at,
      reviewing: this.#reviewing !== undefined,
      reviewError: current === undefined ? this.#lastReviewError : undefined,
    };
  }

  /**
   * ### reviewNow
   *
   * Runs Claude's review now, even if one ran today. A review already
   * running is waited for first, so it cannot finish later and overwrite
   * this one; while this one runs, loads show the Inbox as reviewing.
   *
   * @returns The Inbox with the review's moves.
   * @throws Error When Claude's review fails.
   */
  async reviewNow(): Promise<InboxView> {
    const [{ today, monthStart }, rules, inputs] = await Promise.all([this.#calendar(), this.#deps.rules(), this.#deps.inputs(false)]);
    while (this.#reviewing !== undefined) await this.#reviewing;
    this.#attemptedDay = today;
    const ruled = buildInbox(inputs, rules, Date.now(), today);
    const running = reviewInbox(ruled.items, today);
    this.#track(running.then(() => undefined, () => undefined));
    const review = await running;
    this.#lastReviewError = undefined;
    return {
      ...ruled,
      monthStart,
      items: await this.#withReadState(applyReview(ruled.items, review.moves)),
      reviewedAt: review.at,
      reviewing: false,
      reviewError: undefined,
    };
  }

  /**
   * ### mark
   *
   * Marks items read or unread in mothership, and `linearIds` the same way
   * in Linear. If Linear cannot be reached, the change still holds here and
   * Linear keeps its own state.
   *
   * @param keys - The items' `readKey`s.
   * @param linearIds - Linear notifications to mark the same way in Linear.
   * @returns The Inbox with the change, read from the sources' caches.
   */
  async mark(keys: Array<string>, read: boolean, linearIds: Array<string> = []): Promise<InboxView> {
    await this.#deps.reads.mark(keys, read, Date.now());
    if (linearIds.length > 0) {
      await this.#deps.markLinear(linearIds, read).catch((error: unknown) => {
        console.error(`[inbox] could not mark Linear notifications ${read ? "read" : "unread"}: ${errorMessage(error)}`);
      });
    }
    return this.load(false);
  }

  /** Today and the start of this month in the dashboard's zone, wherever the browser's clock is set. */
  async #calendar(): Promise<{ today: string; monthStart: number }> {
    const timeZone = await this.#deps.timeZone();
    const today = zonedDate(Date.now(), timeZone);
    return { today, monthStart: zonedMidnight(`${today.slice(0, 7)}-01`, timeZone) };
  }

  async #withReadState(items: Array<InboxItem>): Promise<Array<InboxItem>> {
    const state = await this.#deps.reads.state(
      items.map((item) => item.readKey),
      Date.now(),
    );
    return items.map((item) => ({ ...item, unread: isUnread(item, state) }));
  }

  /** Reviewed as the rules sorted them: an older review's moves are not today's. */
  #startReview(ruled: Array<InboxItem>, today: string): void {
    this.#attemptedDay = today;
    this.#lastReviewError = undefined;
    this.#track(
      reviewInbox(ruled, today).then(
        () => undefined,
        (error: unknown) => {
          const coded = error instanceof HttpError ? error : undefined;
          this.#lastReviewError = { code: coded?.code, params: coded?.params, message: errorMessage(error) };
          console.error(`[inbox] Claude review failed: ${this.#lastReviewError.message}`);
        },
      ),
    );
  }

  /** Holds `review` as the one in progress until it settles. */
  #track(review: Promise<void>): void {
    const tracked: Promise<void> = review.finally(() => {
      if (this.#reviewing === tracked) this.#reviewing = undefined;
    });
    this.#reviewing = tracked;
  }
}
