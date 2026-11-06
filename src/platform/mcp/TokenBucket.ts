type Waiter = { background: boolean; resolve: () => void; reject: (reason: unknown) => void; signal: AbortSignal | undefined; onAbort: () => void };

/**
 * ### TokenBucket
 *
 * Spaces calls out to stay under a rate: up to `burst` at once, then
 * `perMinute` a minute. Calls that must wait are served in order, except
 * that background calls let every waiting call someone is waiting on go
 * first.
 */
export class TokenBucket {
  readonly #perMs: number;
  readonly #burst: number;
  readonly #now: () => number;
  #tokens: number;
  #last: number;
  readonly #waiting: Array<Waiter> = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** @param now - Clock, for tests (with fake timers). */
  constructor(perMinute: number, burst: number, now: () => number = Date.now) {
    this.#perMs = perMinute / 60_000;
    this.#burst = burst;
    this.#now = now;
    this.#tokens = burst;
    this.#last = now();
  }

  #refill(): void {
    const now = this.#now();
    this.#tokens = Math.min(this.#burst, this.#tokens + (now - this.#last) * this.#perMs);
    this.#last = now;
  }

  /** Calls waiting for a turn. */
  get waiting(): number {
    return this.#waiting.length;
  }

  /**
   * ### take
   *
   * Resolves when the call may go.
   *
   * @param background - Waits behind calls someone is waiting on.
   * @param signal - Gives up the place in line; rejects with the signal's reason.
   */
  take(background = false, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) return Promise.reject(signal.reason);
    this.#refill();
    if (this.#waiting.length === 0 && this.#tokens >= 1) {
      this.#tokens -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        background,
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.#waiting.indexOf(waiter);
          if (index >= 0) this.#waiting.splice(index, 1);
          reject(signal?.reason);
        },
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      // Behind every call someone waits on; a background call also behind earlier background calls.
      const firstBackground = background ? -1 : this.#waiting.findIndex((w) => w.background);
      if (firstBackground < 0) this.#waiting.push(waiter);
      else this.#waiting.splice(firstBackground, 0, waiter);
      this.#schedule();
    });
  }

  #pump = (): void => {
    this.#timer = undefined;
    this.#refill();
    while (this.#waiting.length > 0 && this.#tokens >= 1) {
      const waiter = this.#waiting.shift() as Waiter;
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      this.#tokens -= 1;
      waiter.resolve();
    }
    this.#schedule();
  };

  #schedule(): void {
    if (this.#timer !== undefined || this.#waiting.length === 0) return;
    this.#timer = setTimeout(this.#pump, Math.max(1, Math.ceil((1 - this.#tokens) / this.#perMs)));
  }
}
