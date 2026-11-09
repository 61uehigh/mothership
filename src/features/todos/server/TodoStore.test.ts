import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localDay } from "@/lib/dates";
import { sortTodos, todoTitleFrom, type Todo } from "@/features/todos/model/Todos";
import { TodoStore } from "@/features/todos/server/TodoStore";

async function tempFile(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "todos-")), "todos.json");
}

describe("TodoStore", () => {
  it("loads a file written before to-dos had notes, a session, or a plan, with defaults", async () => {
    const file = await tempFile();
    await writeFile(file, JSON.stringify([{ id: "a", text: "Old", done: false, createdAt: 1, due: "2026-11-10" }]));
    const [old] = await new TodoStore(file).list();
    expect(old).toEqual({ id: "a", text: "Old", body: "", done: false, doneDayOnly: false, carryCount: 0, blocked: false, createdAt: 1, due: "2026-11-10" });
    expect(old).not.toHaveProperty("sessionId");
    expect(old).not.toHaveProperty("plannedFor");
  });

  it("writes entries that do not parse back unchanged instead of dropping them", async () => {
    const file = await tempFile();
    const odd = { id: "b", text: 42 };
    await writeFile(file, JSON.stringify([{ id: "a", text: "Old", done: false, createdAt: 1 }, odd]));
    const store = new TodoStore(file);
    expect((await store.list()).map((t) => t.id)).toEqual(["a"]);
    await store.add({ text: "New" });
    const saved: Array<unknown> = JSON.parse(await readFile(file, "utf8"));
    expect(saved).toHaveLength(3);
    expect(saved).toContainEqual(odd);
  });

  it("refuses to load, and so to overwrite, a file that is not a JSON list, and tries again on the next call", async () => {
    const file = await tempFile();
    await writeFile(file, "[{ broken");
    const store = new TodoStore(file);
    await expect(store.add({ text: "New" })).rejects.toMatchObject({ status: 409, code: "todos-file-invalid", params: { file } });
    expect(await readFile(file, "utf8")).toBe("[{ broken");
    await writeFile(file, "[]");
    expect(await store.add({ text: "New" })).toMatchObject({ text: "New" });
  });

  it("carries an open to-do planned for a past day over to today when listing, and saves it", async () => {
    const file = await tempFile();
    await writeFile(file, JSON.stringify([{ id: "a", text: "Late", done: false, createdAt: 1, plannedFor: "2020-01-01" }]));
    await new TodoStore(file).list();
    const [saved] = await new TodoStore(file).list();
    expect(saved).toMatchObject({ plannedFor: localDay(Date.now()), carryCount: 1 });
  });

  it("adds something done on another day already checked off on that day", async () => {
    const store = new TodoStore(await tempFile());
    const done = await store.add({ text: "Shipped", doneOn: "2026-11-20" });
    expect(done).toMatchObject({ done: true, doneAt: new Date("2026-11-20T18:00:00").getTime(), doneDayOnly: true });
    expect(await store.add({ text: "Now", doneOn: localDay(Date.now()) })).toMatchObject({ doneDayOnly: false });
    // Reopened and checked off again here: now the time is real.
    await store.update(done.id, { done: false });
    expect(await store.update(done.id, { done: true })).toMatchObject({ doneDayOnly: false });
  });

  it("counts putting a to-do off, clears a plan with null, and unblocks it when done", async () => {
    const store = new TodoStore(await tempFile());
    const today = localDay(Date.now());
    const { id } = await store.add({ text: "Write", plannedFor: today });
    await store.update(id, { blocked: true });
    expect(await store.update(id, { plannedFor: "2999-01-01" })).toMatchObject({ plannedFor: "2999-01-01", carryCount: 1, blocked: true });
    const cleared = await store.update(id, { plannedFor: null });
    expect(cleared).not.toHaveProperty("plannedFor");
    expect(cleared.carryCount).toBe(1);
    expect(await store.update(id, { done: true })).toMatchObject({ done: true, blocked: false });
  });

  it("keeps the entries that still parse when the file has a bad one", async () => {
    const file = await tempFile();
    await writeFile(file, JSON.stringify([{ id: "a", text: "Keep", done: false, createdAt: 1 }, { id: "b" }]));
    expect((await new TodoStore(file).list()).map((t) => t.text)).toEqual(["Keep"]);
  });

  it("keeps both of two overlapping changes to the same to-do", async () => {
    const file = await tempFile();
    const store = new TodoStore(file);
    const { id } = await store.add({ text: "Write" });
    await Promise.all([store.update(id, { body: "notes" }), store.update(id, { done: true })]);
    const [saved] = await new TodoStore(file).list();
    expect(saved).toMatchObject({ body: "notes", done: true });
  });
});

describe("TodoStore.importDone", () => {
  it("adds checked-off to-dos once per source key, however often it runs", async () => {
    const store = new TodoStore(await tempFile());
    const item = (key: string) => ({ text: key, body: "", doneAt: 5, source: { kind: "slack-scrum" as const, url: "u", key, inferred: false } });
    expect(await store.importDone([item("a"), item("b"), item("a")])).toEqual({ added: 2, skipped: 1 });
    expect(await store.importDone([item("a"), item("c")])).toEqual({ added: 1, skipped: 1 });
    const saved = await store.list();
    expect(saved.map((t) => [t.text, t.done, t.doneAt])).toEqual([
      ["a", true, 5],
      ["b", true, 5],
      ["c", true, 5],
    ]);
  });
});

describe("sortTodos", () => {
  const todo = (id: string, fields: Partial<Todo>): Todo => ({ id, text: id, body: "", done: false, doneDayOnly: false, carryCount: 0, blocked: false, createdAt: 0, ...fields });

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

describe("todoTitleFrom", () => {
  it("uses the typed title, else the first line of the notes", () => {
    expect(todoTitleFrom("  Ship it ", "notes")).toBe("Ship it");
    expect(todoTitleFrom("", "\n## Call Jane\nabout the venue")).toBe("Call Jane");
    expect(todoTitleFrom(" ", " ")).toBe("");
  });
});
