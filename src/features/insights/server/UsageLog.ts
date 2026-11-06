import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ENTRY_PATHS, type EntryPath, type FeatureStats, type UsageBatch, type UsageStats } from "@/features/insights/model/Usage";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  feature TEXT NOT NULL,
  area TEXT NOT NULL,
  via TEXT NOT NULL,
  at INTEGER NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS uses_day ON uses(day);
CREATE TABLE IF NOT EXISTS active (
  day TEXT NOT NULL,
  area TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  PRIMARY KEY (day, area)
);
`;

const isEntryPath = (value: string): value is EntryPath => ENTRY_PATHS.some((path) => path === value);
const isUseKind = (value: string): value is FeatureStats["kind"] => value === "open" || value === "command" || value === "action";

/**
 * ### UsageLog
 *
 * Which features you used, how you got to them, and how long you were
 * actively using the app, kept in its own SQLite file on this Mac. Nothing
 * here leaves it.
 */
export class UsageLog {
  readonly #db: DatabaseSync;

  constructor(file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.#db = new DatabaseSync(file);
    this.#db.exec("PRAGMA journal_mode = WAL;");
    this.#db.exec(SCHEMA);
  }

  /**
   * ### record
   *
   * Adds a batch from the browser: each use as a row, active seconds added to their day and area.
   */
  record(batch: UsageBatch): void {
    const insertUse = this.#db.prepare("INSERT INTO uses (kind, feature, area, via, at, day) VALUES (?, ?, ?, ?, ?, ?)");
    const addActive = this.#db.prepare(
      "INSERT INTO active (day, area, seconds) VALUES (?, ?, ?) ON CONFLICT(day, area) DO UPDATE SET seconds = seconds + excluded.seconds",
    );
    this.#db.exec("BEGIN");
    try {
      for (const use of batch.uses) insertUse.run(use.kind, use.feature, use.area, use.via, use.at, use.day);
      for (const slice of batch.active) addActive.run(slice.day, slice.area, slice.seconds);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * ### stats
   *
   * @param since - The first local day to count, `YYYY-MM-DD`.
   * @returns Active time in total, per day, and per area, and each feature's uses by entry path.
   */
  stats(since: string): UsageStats {
    const byDay = this.#db
      .prepare("SELECT day, SUM(seconds) AS seconds FROM active WHERE day >= ? GROUP BY day ORDER BY day")
      .all(since)
      .map((row) => ({ day: String(row.day), seconds: Number(row.seconds) }));
    const byArea = this.#db
      .prepare("SELECT area, SUM(seconds) AS seconds FROM active WHERE day >= ? GROUP BY area ORDER BY seconds DESC")
      .all(since)
      .map((row) => ({ area: String(row.area), seconds: Number(row.seconds) }));

    const features = new Map<string, FeatureStats>();
    const rows = this.#db
      .prepare("SELECT kind, feature, via, COUNT(*) AS count, MAX(at) AS last_at FROM uses WHERE day >= ? GROUP BY kind, feature, via")
      .all(since);
    for (const row of rows) {
      const kind = String(row.kind);
      const via = String(row.via);
      if (!isUseKind(kind) || !isEntryPath(via)) continue;
      const key = `${kind}:${String(row.feature)}`;
      const current = features.get(key) ?? { kind, feature: String(row.feature), count: 0, via: {}, lastAt: 0 };
      const count = Number(row.count);
      current.count += count;
      current.via[via] = (current.via[via] ?? 0) + count;
      current.lastAt = Math.max(current.lastAt, Number(row.last_at));
      features.set(key, current);
    }

    return {
      since,
      activeSeconds: byDay.reduce((total, day) => total + day.seconds, 0),
      byDay,
      byArea,
      features: [...features.values()].sort((a, b) => b.count - a.count),
    };
  }
}
