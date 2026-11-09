import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sortTodos, todoTitleFrom, type Todo } from "@/features/todos/model/Todos";
import { TodoStore } from "@/features/todos/server/TodoStore";

async function tempFile(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "todos-")), "todos.json");
}

describe("TodoStore", () => {
  it("loads a file written before to-dos had notes or a session, with an empty body", async () => {
    const file = await tempFile();
    await writeFile(file, JSON.stringify([{ id: "a", text: "Old", done: false, createdAt: 1, due: "2026-11-10" }]));
    const [old] = await new TodoStore(file).list();
    expect(old).toEqual({ id: "a", text: "Old", body: "", done: false, createdAt: 1, due: "2026-11-10" });
    expect(old).not.toHaveProperty("sessionId");
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

describe("sortTodos", () => {
  const todo = (id: string, fields: Partial<Todo>): Todo => ({ id, text: id, body: "", done: false, createdAt: 0, ...fields });

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
