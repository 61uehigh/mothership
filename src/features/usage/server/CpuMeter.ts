import { cpus } from "node:os";

type Sample = Array<{ idle: number; total: number }>;

function sample(): Sample {
  return cpus().map((c) => ({ idle: c.times.idle, total: Object.values(c.times).reduce((a, b) => a + b, 0) }));
}

/**
 * ### CpuMeter
 *
 * Whole-machine CPU use between readings. Each reader keeps its own meter,
 * so the status bar's average is not cut short by another page polling.
 */
export class CpuMeter {
  #previous: Sample | undefined;

  /** Whether a reading has been taken, so the next {@link CpuMeter.percent} has something to compare with. */
  get primed(): boolean {
    return this.#previous !== undefined;
  }

  /**
   * ### percent
   *
   * @returns Use since the previous call, 0–100; `undefined` on the first call.
   */
  percent(): number | undefined {
    const next = sample();
    const previous = this.#previous;
    this.#previous = next;
    if (previous === undefined) return undefined;
    const idle = next.reduce((n, s, i) => n + s.idle - (previous[i]?.idle ?? 0), 0);
    const total = next.reduce((n, s, i) => n + s.total - (previous[i]?.total ?? 0), 0);
    return total <= 0 ? undefined : Math.round((1 - idle / total) * 100);
  }
}
