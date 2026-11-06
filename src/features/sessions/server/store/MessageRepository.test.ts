import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/features/sessions/server/store/database";
import { MessageRepository } from "@/features/sessions/server/store/MessageRepository";

const dirs: Array<string> = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("MessageRepository.removeQueued", () => {
  it("takes back a queued message, but never one whose turn started", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mothership-messages-"));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, "mothership.db"));
    const agent = "INSERT INTO agents (id, name, provider, status, working_directory, created_at, last_activity_at) VALUES (?, ?, 'claude', 'idle', '/tmp', 0, 0)";
    db.prepare(agent).run("a", "lead");
    db.prepare(agent).run("b", "other");
    const messages = new MessageRepository(db);
    const message = (id: string, createdAt: number) => ({ id, agentId: "a", senderId: undefined, kind: "message" as const, text: id, createdAt, deliveredAt: undefined });
    messages.insert(message("first", 1));
    messages.insert(message("second", 2));

    expect(messages.takeNext("a")?.id).toBe("first");
    expect(messages.removeQueued("a", "first")).toBe(false);
    expect(messages.removeQueued("b", "second")).toBe(false);
    expect(messages.removeQueued("a", "second")).toBe(true);
    expect(messages.list("a").map((m) => m.id)).toEqual(["first"]);
    expect(messages.takeNext("a")).toBeUndefined();
    // Windows cannot delete a database that is still open.
    db.close();
  });
});
