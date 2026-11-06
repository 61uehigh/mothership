/**
 * ### ToolCallOutcome
 *
 * - `ok`, `error`: the call was made.
 * - `rate_limited`: it was made and the tool refused it for too many calls.
 * - `held`: it was not made, because the tool was rate limiting.
 */
export type ToolCallOutcome = "ok" | "error" | "rate_limited" | "held";

type Entry = { at: number; tool: string; name: string; source: string; outcome: ToolCallOutcome };

/**
 * ### ToolCallCounts
 *
 * Calls to one tool backend over a span of time. `calls` counts only calls
 * that were made; `held` ones were not.
 */
export type ToolCallCounts = {
  /** e.g. `Nuclino`. */
  tool: string;
  calls: number;
  rateLimited: number;
  held: number;
  /** Calls made, most first. */
  bySource: Array<{ source: string; calls: number }>;
  /** Calls made by tool name (`get_item`, `list_items`, …), most first. */
  byName: Array<{ name: string; calls: number }>;
};

/** How long calls are remembered. */
const KEEP_MS = 60 * 60_000;

function ranked(counts: Map<string, number>): Array<[string, number]> {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * ### ToolCallLedger
 *
 * Counts the calls the server makes to each tool backend, by source (what
 * made them) and outcome, for the last hour. Rate limits are per account, so
 * knowing which part of mothership spends them is the first step to staying
 * under one. Agents' own MCP connections are not counted here.
 */
export class ToolCallLedger {
  readonly #entries: Array<Entry> = [];
  readonly #now: () => number;

  /** @param now - Clock, for tests. */
  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /**
   * ### record
   *
   * @param tool - The backend, e.g. `Nuclino`.
   * @param name - The tool called, e.g. `get_item`.
   */
  record(tool: string, name: string, source: string, outcome: ToolCallOutcome): void {
    const at = this.#now();
    this.#entries.push({ at, tool, name, source, outcome });
    let stale = 0;
    while (stale < this.#entries.length && at - this.#entries[stale].at > KEEP_MS) stale++;
    if (stale > 0) this.#entries.splice(0, stale);
  }

  /**
   * ### counts
   *
   * @param from - Epoch milliseconds, inclusive.
   * @param to - Epoch milliseconds, exclusive; defaults to now.
   * @returns One entry per backend called in that span, busiest first.
   */
  counts(from: number, to = this.#now() + 1): Array<ToolCallCounts> {
    const byTool = new Map<string, { calls: number; rateLimited: number; held: number; sources: Map<string, number>; names: Map<string, number> }>();
    for (const entry of this.#entries) {
      if (entry.at < from || entry.at >= to) continue;
      let counts = byTool.get(entry.tool);
      if (counts === undefined) {
        counts = { calls: 0, rateLimited: 0, held: 0, sources: new Map(), names: new Map() };
        byTool.set(entry.tool, counts);
      }
      if (entry.outcome === "held") {
        counts.held++;
        continue;
      }
      if (entry.outcome === "rate_limited") counts.rateLimited++;
      counts.calls++;
      counts.sources.set(entry.source, (counts.sources.get(entry.source) ?? 0) + 1);
      counts.names.set(entry.name, (counts.names.get(entry.name) ?? 0) + 1);
    }
    return [...byTool]
      .map(([tool, c]) => ({
        tool,
        calls: c.calls,
        rateLimited: c.rateLimited,
        held: c.held,
        bySource: ranked(c.sources).map(([source, calls]) => ({ source, calls })),
        byName: ranked(c.names).map(([name, calls]) => ({ name, calls })),
      }))
      .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
  }

  /**
   * ### minuteLines
   *
   * One log line per backend for the minute before the one `now` is in, e.g.
   * `[tool calls] Nuclino 12:03: 23 calls (meetings list 15, sidebar 6, search 2) · 1 rate limited · 3 held back`.
   *
   * @returns No lines for a minute without calls.
   */
  minuteLines(now = this.#now()): Array<string> {
    const end = now - (now % 60_000);
    const start = end - 60_000;
    const minute = new Date(start).toTimeString().slice(0, 5);
    return this.counts(start, end).map((c) => {
      const sources = c.bySource.map((s) => `${s.source} ${s.calls}`).join(", ");
      const extra = [c.rateLimited > 0 ? `${c.rateLimited} rate limited` : "", c.held > 0 ? `${c.held} held back` : ""].filter(Boolean);
      return `[tool calls] ${c.tool} ${minute}: ${c.calls} ${c.calls === 1 ? "call" : "calls"}${sources === "" ? "" : ` (${sources})`}${extra.map((e) => ` · ${e}`).join("")}`;
    });
  }
}
