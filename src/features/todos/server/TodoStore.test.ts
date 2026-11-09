import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sortTodos, type Todo } from "@/features/todos/model/Todos";
import { TodoStore } from "@/features/todos/server/TodoStore";
import { HttpError } from "@/platform/http/HttpError";

async function tempFile(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "todos-")), "todos.json");
}

describe("TodoStore", () => {
  it("adds, checks off, edits, and clears to-dos, keeping them on disk", async () => {
    const file = await tempFile();
    const store = new TodoStore(file);
    const write = await store.add({ text: "Write the spec", due: "2026-11-10" });
    const call = await store.add({ text: "Call Jane", source: { kind: "meeting", itemId: "32551b7d-cd10-4361-8d59-8135896e35ca", title: "Weekly" } });
    expect((await store.update(call.id, { done: true })).doneAt).toBeTypeOf("number");
    expect(await store.update(write.id, { text: "Write the spec v2", due: null })).not.toHaveProperty("due");
    expect((await store.update(call.id, { done: false })).doneAt).toBeUndefined();
    await store.update(call.id, { done: true });

    const reopened = new TodoStore(file);
    expect((await reopened.list()).map((t) => [t.text, t.done])).toEqual([
      ["Write the spec v2", false],
      ["Call Jane", true],
    ]);
    expect(await reopened.clearDone()).toBe(1);
    await reopened.remove(write.id);
    await reopened.remove(write.id);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual([]);
  });

  it("refuses to change a to-do that does not exist", async () => {
    await expect(new TodoStore(await tempFile()).update("nope", { done: true })).rejects.toBeInstanceOf(HttpError);
  });

  it("keeps the entries that still parse when the file has a bad one", async () => {
    const file = await tempFile();
    await writeFile(file, JSON.stringify([{ id: "a", text: "Keep", done: false, createdAt: 1 }, { id: "b" }]));
    expect((await new TodoStore(file).list()).map((t) => t.text)).toEqual(["Keep"]);
  });
});

describe("sortTodos", () => {
  const todo = (id: string, fields: Partial<Todo>): Todo => ({ id, text: id, done: false, createdAt: 0, ...fields });

  it("puts dated to-dos first by date, then the rest newest first, then done ones", () => {
    const sorted = sortTodos([
      todo("old", { createdAt: 1 }),
      todo("done-early", { done: true, doneAt: 5 }),
      todo("friday", { due: "2026-11-13" }),
      todo("new", { createdAt: 2 }),
      todo("monday", { due: "2026-11-09" }),
      todo("done-late", { done: true, doneAt: 9 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["monday", "friday", "new", "old", "done-late", "done-early"]);
  });
});
