import { currentCallPurpose } from "@/platform/mcp/callPurpose";
import { TokenBucket } from "@/platform/mcp/TokenBucket";
import type { ToolCallLedger } from "@/platform/mcp/ToolCallLedger";
import type { CallOptions, ToolCaller } from "@/platform/mcp/ToolCaller";

/** The first pause after a rate limit; each one right after it doubles, up to {@link MAX_PAUSE_MS}. */
const FIRST_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 5 * 60_000;

// Nuclino answers HTTP 429 with `{"status":"fail","message":"You've made too many requests and hit a rate limit"}`;
// the MCP SDK puts that body in the message, and a relay passes on only the text.
const RATE_LIMITED = /rate.?limit|too many requests|\b429\b/i;

/**
 * ### RATE_LIMITED_CODE
 *
 * The `code` routes answer a rate limit with (status 429), so a view can wait and retry.
 */
export const RATE_LIMITED_CODE = "rate_limited";

/**
 * ### ToolRateLimitError
 *
 * A tool backend refused calls for making too many. Calls to it are not made
 * again until `retryAt`.
 */
export class ToolRateLimitError extends Error {
  /**
   * @param service - Shown to the user, e.g. `Nuclino`.
   * @param retryAt - Epoch milliseconds when calls resume.
   */
  constructor(
    readonly service: string,
    readonly retryAt: number,
    options?: ErrorOptions,
  ) {
    super(`${service} is rate limiting requests; retrying in ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))}s.`, options);
    this.name = "ToolRateLimitError";
  }
}

/**
 * ### isRateLimited
 *
 * Whether a failed call was a rate limit: an HTTP 429 anywhere in its cause
 * chain (the MCP SDK's `StreamableHTTPError` carries it as `code`, during
 * connect as well as on a call), or a message that says so.
 */
export function isRateLimited(error: unknown): boolean {
  for (let current = error, depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
    if (current instanceof ToolRateLimitError) return true;
    if (typeof current !== "object") return typeof current === "string" && RATE_LIMITED.test(current);
    if (("code" in current && current.code === 429) || ("status" in current && current.status === 429)) return true;
    if (current instanceof Error && RATE_LIMITED.test(current.message)) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/** `mcp:nuclino` → `Nuclino`. */
function serviceName(label: string): string {
  const name = label.slice(label.indexOf(":") + 1);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * ### CallBudget
 *
 * The most calls a minute mothership makes to one backend: `perMinute`
 * sustained, `burst` at once after a quiet spell.
 */
export type CallBudget = { perMinute: number; burst: number };

/**
 * ### RateLimitGateOptions
 *
 * @property now - Clock, for tests.
 * @property budgets - By service name in lower case (`nuclino`); a backend without one is not spaced out.
 * @property ledger - Counts every call and every call held back.
 */
export type RateLimitGateOptions = { now?: () => number; budgets?: Record<string, CallBudget>; ledger?: ToolCallLedger };

/**
 * ### RateLimitGate
 *
 * Shared by every caller of a backend, so once it answers "too many
 * requests" nothing calls it again (not the sidebar, search, a detail view,
 * nor a reconnect) until a pause is over. Then one call goes first and the
 * rest wait for it, so a burst of waiting calls does not trip the limit
 * again. Pauses double while the limit keeps coming back, and reset after a
 * call goes through. A backend with a budget is also spaced out so it stays
 * under its limit in the first place.
 */
export class RateLimitGate {
  readonly #paused = new Map<string, { until: number; strikes: number }>();
  /** The first call after a pause, by label, settled either way. */
  readonly #probes = new Map<string, Promise<void>>();
  readonly #buckets = new Map<string, TokenBucket>();
  readonly #now: () => number;
  readonly #budgets: Record<string, CallBudget>;
  readonly #ledger: ToolCallLedger | undefined;

  constructor({ now = Date.now, budgets = {}, ledger }: RateLimitGateOptions = {}) {
    this.#now = now;
    this.#budgets = budgets;
    this.#ledger = ledger;
  }

  /** One bucket per service, shared by its MCP server and its claude.ai connector, which spend the same account. */
  #bucket(label: string): TokenBucket | undefined {
    const service = serviceName(label).toLowerCase();
    const budget = this.#budgets[service];
    if (budget === undefined) return undefined;
    let bucket = this.#buckets.get(service);
    if (bucket === undefined) {
      bucket = new TokenBucket(budget.perMinute, budget.burst, this.#now);
      this.#buckets.set(service, bucket);
    }
    return bucket;
  }

  /**
   * ### retryAt
   *
   * @returns Epoch milliseconds when calls to `label` resume, or `undefined` when they are not paused.
   */
  retryAt(label: string): number | undefined {
    const until = this.#paused.get(label)?.until;
    return until !== undefined && this.#now() < until ? until : undefined;
  }

  /** Starts or extends the pause after a rate limit; calls already in flight when it hit do not extend it. */
  #limited(label: string): number {
    const now = this.#now();
    const last = this.#paused.get(label);
    if (last !== undefined && now < last.until) return last.until;
    const strikes = (last?.strikes ?? 0) + 1;
    const until = now + Math.min(FIRST_PAUSE_MS * 2 ** (strikes - 1), MAX_PAUSE_MS);
    this.#paused.set(label, { until, strikes });
    return until;
  }

  async #through<T>(label: string, name: string, call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const purpose = currentCallPurpose();
    const service = serviceName(label);
    const record = (outcome: Parameters<ToolCallLedger["record"]>[3]) => this.#ledger?.record(service, name, purpose.source, outcome);
    for (;;) {
      const paused = this.retryAt(label);
      if (paused !== undefined) {
        record("held");
        throw new ToolRateLimitError(service, paused);
      }
      const probe = this.#probes.get(label);
      if (probe === undefined) {
        const bucket = this.#bucket(label);
        if (bucket === undefined) break;
        await bucket.take(purpose.background, signal);
        // A pause may have started, or a probe gone out, while this call waited its turn.
        if (this.retryAt(label) === undefined && !this.#probes.has(label)) break;
        continue;
      }
      await probe;
    }
    const attempt = this.#attempt(label, call).then(
      (result) => {
        record("ok");
        return result;
      },
      (error: unknown) => {
        record(error instanceof ToolRateLimitError ? "rate_limited" : "error");
        throw error;
      },
    );
    // A pause just ended (its entry stays until a call goes through): this call is the probe.
    if (this.#paused.has(label)) {
      const settled = attempt.then(
        () => undefined,
        () => undefined,
      );
      this.#probes.set(label, settled);
      void settled.then(() => {
        if (this.#probes.get(label) === settled) this.#probes.delete(label);
      });
    }
    return attempt;
  }

  async #attempt<T>(label: string, call: () => Promise<T>): Promise<T> {
    try {
      const result = await call();
      if (this.retryAt(label) === undefined) this.#paused.delete(label);
      return result;
    } catch (error) {
      if (error instanceof ToolRateLimitError || !isRateLimited(error)) throw error;
      throw new ToolRateLimitError(serviceName(label), this.#limited(label), { cause: error });
    }
  }

  /**
   * ### wrap
   *
   * @returns `caller`, with its calls held back while its backend is rate
   *   limiting; a rate limit becomes a {@link ToolRateLimitError}.
   */
  wrap(caller: ToolCaller): ToolCaller {
    return {
      ...caller,
      callText: (tool, args, options?: CallOptions) => this.#through(caller.label, tool, () => caller.callText(tool, args, options), options?.signal),
      describe: (tool) => this.#through(caller.label, "describe", () => caller.describe(tool)),
    };
  }
}
