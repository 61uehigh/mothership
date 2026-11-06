import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenBucket } from "@/platform/mcp/TokenBucket";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TokenBucket", () => {
  it("lets a burst through, then one call per share of a minute", async () => {
    const bucket = new TokenBucket(60, 3);
    const started: Array<number> = [];
    const t0 = Date.now();
    const calls = Array.from({ length: 6 }, () => bucket.take().then(() => started.push(Date.now() - t0)));
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(calls);
    expect(started).toEqual([0, 0, 0, 1000, 2000, 3000]);
  });

  it("never goes over its rate in any minute, however many calls wait", async () => {
    const bucket = new TokenBucket(60, 10);
    const started: Array<number> = [];
    const t0 = Date.now();
    const calls = Array.from({ length: 274 }, () => bucket.take(true).then(() => started.push(Date.now() - t0)));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await Promise.all(calls);
    for (let from = 0; from < 5 * 60_000; from += 1000) {
      expect(started.filter((t) => t >= from && t < from + 60_000).length).toBeLessThanOrEqual(70);
    }
    // Sustained: after the first burst of 10, one a second.
    expect(started.at(-1)).toBe(264_000);
  });

  it("lets a call someone waits on go before background calls already waiting", async () => {
    const bucket = new TokenBucket(60, 1);
    const order: Array<string> = [];
    await bucket.take();
    const background = [1, 2, 3].map((n) => bucket.take(true).then(() => order.push(`background ${n}`)));
    const opened = bucket.take(false).then(() => order.push("opened a note"));
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([...background, opened]);
    expect(order).toEqual(["opened a note", "background 1", "background 2", "background 3"]);
  });

  it("gives up a place in line when the caller does", async () => {
    const bucket = new TokenBucket(60, 1);
    await bucket.take();
    const controller = new AbortController();
    const waiting = bucket.take(false, controller.signal);
    controller.abort(new Error("deadline"));
    await expect(waiting).rejects.toThrow("deadline");
    expect(bucket.waiting).toBe(0);
  });
});
