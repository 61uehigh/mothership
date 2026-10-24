import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  effort TEXT,
  parent_id TEXT REFERENCES agents(id),
  status TEXT NOT NULL,
  session_ref TEXT,
  working_directory TEXT NOT NULL,
  mcp TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  sender_id TEXT REFERENCES agents(id),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_agent ON messages(agent_id, created_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_agent ON events(agent_id, id);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  status TEXT NOT NULL,
  answer TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
`;

// Columns added after the first release; created on databases that predate them.
const ADDED_COLUMNS: Record<string, Record<string, string>> = {
  agents: {
    control_token: "TEXT",
    status_note: "TEXT",
    links: "TEXT NOT NULL DEFAULT '[]'",
    worktree: "TEXT",
    compare_group: "TEXT",
    archived_at: "INTEGER",
    allow_git: "INTEGER NOT NULL DEFAULT 0",
  },
  messages: { kind: "TEXT NOT NULL DEFAULT 'message'" },
};

/**
 * ### openDatabase
 *
 * Opens (creating if needed) the sessions database and brings its schema up
 * to date. `node:sqlite` blocks briefly per call, which is fine for a
 * single-user local app.
 *
 * @param file - Database path; parent directories are created.
 */
export function openDatabase(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name as string));
    for (const [column, type] of Object.entries(columns)) {
      if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  return db;
}

/**
 * ### transaction
 *
 * Runs `work` in one transaction: all of it is saved, or none of it.
 */
export function transaction(db: DatabaseSync, work: () => void): void {
  db.exec("BEGIN");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
