import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

    const rows = openDatabase(file).prepare("SELECT id, provider, model, session_ref FROM agents ORDER BY id").all();
    expect(rows).toEqual([
      { id: "a", provider: "codex", model: null, session_ref: null },
      { id: "b", provider: "codex", model: "gpt-6.2-sol", session_ref: "thread_1" },
    ]);
  });
});
