import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/features/sessions/server/store/database";

const dirs: Array<string> = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("moves sessions of the removed OpenAI agents to Codex, starting a new thread", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mothership-db-"));
    dirs.push(dir);
    const file = path.join(dir, "mothership.db");
    const insert = "INSERT INTO agents (id, name, provider, model, status, session_ref, working_directory, created_at, last_activity_at) VALUES (?, ?, ?, ?, 'idle', ?, '/tmp', 0, 0)";
    const first = openDatabase(file);
    first.prepare(insert).run("a", "lookup", "openai", "gpt-5", "resp_123");
    first.prepare(insert).run("b", "worker", "codex", "gpt-6.2-sol", "thread_1");
    first.close();

    const second = openDatabase(file);
    const rows = second.prepare("SELECT id, provider, model, session_ref FROM agents ORDER BY id").all();
    // Windows cannot delete a database that is still open.
    second.close();
    expect(rows).toEqual([
      { id: "a", provider: "codex", model: null, session_ref: null },
      { id: "b", provider: "codex", model: "gpt-6.2-sol", session_ref: "thread_1" },
    ]);
  });

  it("turns approvals stored as prefixed questions into approval rows", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mothership-db-"));
    dirs.push(dir);
    const file = path.join(dir, "mothership.db");
    // A database from before questions had a kind.
    const old = new DatabaseSync(file);
    old.exec(
      "CREATE TABLE questions (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, status TEXT NOT NULL, answer TEXT, created_at INTEGER NOT NULL, resolved_at INTEGER)",
    );
    const insert = old.prepare("INSERT INTO questions (id, agent_id, question, options, status, created_at) VALUES (?, 'a', ?, '[]', 'open', 0)");
    insert.run("1", "Allow this?\n\nPublish x as an Artifact");
    insert.run("2", "Allow this command?\n\ngit push");
    insert.run("3", "Which branch?");
    old.close();

    const db = openDatabase(file);
    const rows = db.prepare("SELECT id, kind, question FROM questions ORDER BY id").all();
    db.close();
    expect(rows).toEqual([
      { id: "1", kind: "approval", question: "Publish x as an Artifact" },
      { id: "2", kind: "approval", question: "git push" },
      { id: "3", kind: "question", question: "Which branch?" },
    ]);
  });

  it("marks feedback leads named before `origin` existed once, and never a session named so later", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mothership-db-"));
    dirs.push(dir);
    const file = path.join(dir, "mothership.db");
    const insert = "INSERT INTO agents (id, name, parent_id, provider, status, working_directory, created_at, last_activity_at) VALUES (?, ?, ?, 'claude', 'idle', '/tmp', 0, 0)";
    const old = new DatabaseSync(file);
    old.exec("CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, provider TEXT NOT NULL, model TEXT, effort TEXT, parent_id TEXT, status TEXT NOT NULL, session_ref TEXT, working_directory TEXT NOT NULL, mcp TEXT, created_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL)");
    old.prepare(insert).run("lead", "Feedback: taller box", null);
    old.prepare(insert).run("child", "Feedback: helper", "lead");
    old.close();

    const first = openDatabase(file);
    first.prepare(insert).run("later", "Feedback: my own name", null);
    first.close();
    const second = openDatabase(file);
    const rows = second.prepare("SELECT id, origin FROM agents ORDER BY id").all();
    second.close();
    expect(rows).toEqual([
      { id: "child", origin: null },
      { id: "later", origin: null },
      { id: "lead", origin: "feedback" },
    ]);
  });
});
