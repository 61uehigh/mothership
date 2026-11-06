import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LiveUpdate } from "@/features/sessions/model/Agent";
import { QuestionDesk } from "@/features/sessions/server/runtime/QuestionDesk";
import { openDatabase } from "@/features/sessions/server/store/database";
import { QuestionRepository } from "@/features/sessions/server/store/QuestionRepository";
import { HttpError } from "@/platform/http/HttpError";

let dir: string;
let db: DatabaseSync;
let told: Array<string>;

function desk(): QuestionDesk {
  const listeners = new Set<(update: LiveUpdate) => void>();
  return new QuestionDesk({
    questions: new QuestionRepository(db),
    emit: (update) => {
      for (const listener of listeners) listener(update);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    canTakeWork: () => true,
    tell: (_agentId, text) => told.push(text),
  });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mothership-questions-"));
  db = openDatabase(path.join(dir, "mothership.db"));
  db.prepare("INSERT INTO agents (id, name, provider, status, working_directory, created_at, last_activity_at) VALUES ('a', 'a', 'claude', 'idle', '/tmp', 0, 0)").run();
  told = [];
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const openQuestion = (questions: QuestionDesk) => {
  const record = new QuestionRepository(db).list().find((q) => q.status === "open");
  if (record === undefined) throw new Error("no open question");
  return { questions, id: record.id, kind: record.kind, text: record.question };
};

describe("QuestionDesk approvals", () => {
  it("records an approval as its own kind and allows the action only on allow", async () => {
    const questions = desk();
    const allowed = questions.approve("a", "git push origin main", new AbortController().signal);
    const open = openQuestion(questions);
    expect(open).toMatchObject({ kind: "approval", text: "git push origin main" });
    questions.resolve(open.id, "allow");
    expect(await allowed).toBe(true);
    // The answer goes to the waiting action, not to the agent as a message.
    expect(told).toEqual([]);
  });

  it("denies on deny or when closed", async () => {
    const questions = desk();
    const denied = questions.approve("a", "git push", new AbortController().signal);
    questions.resolve(openQuestion(questions).id, "deny");
    expect(await denied).toBe(false);
    const closed = questions.approve("a", "git push", new AbortController().signal);
    questions.resolve(openQuestion(questions).id, undefined);
    expect(await closed).toBe(false);
  });

  it("refuses typed text for an approval instead of denying it silently", async () => {
    const questions = desk();
    void questions.approve("a", "git push", new AbortController().signal);
    const { id } = openQuestion(questions);
    for (const typed of ["yes", "Allow", "허용"]) expect(() => questions.resolve(id, typed)).toThrow(HttpError);
    expect(new QuestionRepository(db).get(id)?.status).toBe("open");
  });

  it("dismisses approvals a previous server left open, but keeps open questions", () => {
    const first = desk();
    void first.approve("a", "git push", new AbortController().signal);
    first.ask("a", "Which branch?", []);
    desk();
    const statuses = new QuestionRepository(db).list().map((q) => [q.kind, q.status]);
    expect(statuses).toEqual(expect.arrayContaining([["approval", "dismissed"], ["question", "open"]]));
  });

  it("delivers an ordinary answer to the agent", () => {
    const questions = desk();
    const asked = questions.ask("a", "Which branch?", ["main"]);
    questions.resolve(asked.id, "main");
    expect(told).toEqual(["[Answer from the human]\nQuestion: Which branch?\nAnswer: main"]);
  });
});
