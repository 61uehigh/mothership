import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sortTodos, todoSchema, type NewTodo, type Todo, type TodoChange } from "@/features/todos/model/Todos";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### TodoStore
 *
 * Your to-dos, kept in one JSON file. Writes go one at a time and replace
 * the file whole, so a crash never leaves half a list.
 */
export class TodoStore {
  readonly #file: string;
  #todos: Array<Todo> | undefined;
  #writing: Promise<void> = Promise.resolve();

  /** @param file - Absolute path of the JSON file, e.g. `dataPath(".mothership", "todos.json")`. */
  constructor(file: string) {
    this.#file = file;
  }

  async #load(): Promise<Array<Todo>> {
    if (this.#todos === undefined) {
      let raw: unknown = [];
      try {
        raw = JSON.parse(await readFile(this.#file, "utf8"));
      } catch {
        // No file yet (or unreadable): start empty.
      }
      // Keep the entries that still parse rather than losing the whole list to one bad one.
      this.#todos = Array.isArray(raw) ? raw.flatMap((entry) => (todoSchema.safeParse(entry).success ? [entry as Todo] : [])) : [];
    }
    return this.#todos;
  }

  async #save(todos: Array<Todo>): Promise<void> {
    this.#todos = todos;
    const json = `${JSON.stringify(todos, null, 2)}\n`;
    this.#writing = this.#writing.then(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      await writeFile(`${this.#file}.tmp`, json);
      await rename(`${this.#file}.tmp`, this.#file);
    });
    await this.#writing;
  }

  /**
   * ### list
   *
   * @returns Every to-do, in the order `sortTodos` gives.
   */
  async list(): Promise<Array<Todo>> {
    return sortTodos(await this.#load());
  }

  /**
   * ### add
   *
   * @returns The new to-do.
   */
  async add(input: NewTodo): Promise<Todo> {
    const todo: Todo = { id: randomUUID(), text: input.text, done: false, createdAt: Date.now(), ...(input.due === undefined ? {} : { due: input.due }), ...(input.source === undefined ? {} : { source: input.source }) };
    await this.#save([...(await this.#load()), todo]);
    return todo;
  }

  /**
   * ### update
   *
   * @returns The changed to-do.
   * @throws HttpError 404 when there is no such to-do.
   */
  async update(id: string, change: TodoChange): Promise<Todo> {
    const todos = await this.#load();
    const current = todos.find((t) => t.id === id);
    if (current === undefined) throw new HttpError("No such to-do", 404);
    const { due, ...rest } = { ...current, ...change };
    const next: Todo = { ...rest, ...(due === null || due === undefined ? {} : { due }) };
    if (change.done === true && !current.done) next.doneAt = Date.now();
    if (change.done === false) delete next.doneAt;
    await this.#save(todos.map((t) => (t.id === id ? next : t)));
    return next;
  }

  /**
   * ### remove
   *
   * Deletes one to-do; an unknown id is ignored, so deleting twice is fine.
   */
  async remove(id: string): Promise<void> {
    const todos = await this.#load();
    if (todos.some((t) => t.id === id)) await this.#save(todos.filter((t) => t.id !== id));
  }

  /**
   * ### clearDone
   *
   * Deletes every checked-off to-do.
   *
   * @returns How many were deleted.
   */
  async clearDone(): Promise<number> {
    const todos = await this.#load();
    const open = todos.filter((t) => !t.done);
    if (open.length !== todos.length) await this.#save(open);
    return todos.length - open.length;
  }
}

/** Checks that an id from a URL looks like one the store made. */
export const todoIdSchema = z.uuid({ error: "Not a to-do id" });
