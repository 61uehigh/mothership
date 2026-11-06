import type { ToolKind } from "@/features/tools/model/Dashboard";
import type { ToolOutcome } from "@/features/tools/server/DashboardService";

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 200;

/**
 * ### DETAIL_PREFIXES
 *
 * Cache key prefix of each tool's cached details, so a write to the tool
 * can drop them all. Calendar's has no colon on purpose: it covers both
 * `calendar:<event>` and `calendar-range:…`.
 */
export const DETAIL_PREFIXES: Record<ToolKind, string> = { slack: "slack:", calendar: "calendar", linear: "linear:", nuclino: "nuclino:", notion: "notion:" };

/**
 * ### LINEAR_NOTIFICATIONS_KEY
 *
 * Where the Inbox caches your Linear notifications; under Linear's prefix, so a Linear write refreshes them.
 */
export const LINEAR_NOTIFICATIONS_KEY = `${DETAIL_PREFIXES.linear}notifications`;

/**
 * ### DetailCache
 *
 * Remembers successful detail loads for ten minutes. Slack and Calendar
 * details go through the claude.ai connector relay, where each call costs a
 * little Claude usage, so reopening a tab should not call again. Failures
 * are not cached. One instance is shared by every route.
 */
export class DetailCache {
  readonly #entries = new Map<string, { at: number; outcome: ToolOutcome<unknown> }>();
  /** Bumped by every `forget`, so a load that started before one is not cached after it. */
  #generation = 0;

  /**
   * ### cached
   *
   * @param key - Identity of the detail, e.g. `slack:<permalink>`.
   * @param refresh - Skip the cache (the tab's reload button).
   * @param load - Makes the call on a miss.
   */
  async cached<T>(key: string, refresh: boolean, load: () => Promise<ToolOutcome<T>>): Promise<ToolOutcome<T>> {
    const hit = this.#entries.get(key);
    if (!refresh && hit !== undefined && Date.now() - hit.at < TTL_MS) {
      // Stored under this key by the same route, so it has the same type.
      return hit.outcome as ToolOutcome<T>;
    }
    const generation = this.#generation;
    const outcome = await load();
    if (outcome.status === "ok" && generation === this.#generation) {
      this.#entries.delete(key);
      this.#entries.set(key, { at: Date.now(), outcome });
      // Maps iterate oldest first; drop the oldest beyond the cap.
      for (const old of this.#entries.keys()) {
        if (this.#entries.size <= MAX_ENTRIES) break;
        this.#entries.delete(old);
      }
    }
    return outcome;
  }

  /**
   * ### forget
   *
   * Drops cached details whose key starts with `prefix`, after a change made
   * from mothership (a sent reply, an RSVP) so the next load is fresh.
   */
  forget(prefix: string): void {
    this.#generation++;
    for (const key of this.#entries.keys()) if (key.startsWith(prefix)) this.#entries.delete(key);
  }
}
