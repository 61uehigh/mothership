import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { sortTodos, todoSchema, type NewTodo, type Todo, type TodoChange } from "@/features/todos/model/Todos";
import { writeQueueFor, toJsonFile, writeFileAtomic } from "@/platform/files";
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
      // Keep the entries that still parse rather than losing the whole list to one bad one;
      // parsing fills fields older files lack (an empty body).
      this.#todos = Array.isArray(raw)
        ? raw.flatMap((entry) => {
            const parsed = todoSchema.safeParse(entry);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
    }
    return this.#todos;
  }

  /**
   * Reads, changes, and saves the list as one step, so two overlapping
   * changes (typing notes while ticking it off) cannot drop each other.
   * `change` returns `undefined` for the list when nothing changed.
   */
  #change<R>(change: (todos: Array<Todo>) => { todos: Array<Todo> | undefined; result: R }): Promise<R> {
    return writeQueueFor(this.#file)(async () => {
      const { todos, result } = change(await this.#load());
      if (todos !== undefined) {
        this.#todos = todos;
        await writeFileAtomic(this.#file, toJsonFile(todos));
      }
      return result;
    });
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
   * @throws HttpError 409 when `input.id` is already taken.
   */
  add(input: NewTodo): Promise<Todo> {
    return this.#change((todos) => {
      if (input.id !== undefined && todos.some((t) => t.id === input.id)) throw new HttpError("That to-do already exists", 409);
      const todo: Todo = {
        id: input.id ?? randomUUID(),
        text: input.text,
        body: input.body ?? "",
        done: false,
        createdAt: Date.now(),
        ...(input.due === undefined ? {} : { due: input.due }),
        ...(input.source === undefined ? {} : { source: input.source }),
      };
      return { todos: [...todos, todo], result: todo };
    });
  }

  /**
   * ### update
   *
   * @returns The changed to-do.
   * @throws HttpError 404 when there is no such to-do.
   */
  update(id: string, change: TodoChange): Promise<Todo> {
    return this.#change((todos) => {
      const current = todos.find((t) => t.id === id);
      if (current === undefined) throw new HttpError("No such to-do", 404);
      const { due, sessionId, ...rest } = { ...current, ...change };
      const next: Todo = {
        ...rest,
        ...(due === null || due === undefined ? {} : { due }),
        ...(sessionId === null || sessionId === undefined ? {} : { sessionId }),
      };
      if (change.done === true && !current.done) next.doneAt = Date.now();
      if (change.done === false) delete next.doneAt;
      return { todos: todos.map((t) => (t.id === id ? next : t)), result: next };
    });
  }

  /**
   * ### remove
   *
   * Deletes one to-do; an unknown id is ignored, so deleting twice is fine.
   */
  remove(id: string): Promise<void> {
    return this.#change((todos) => ({ todos: todos.some((t) => t.id === id) ? todos.filter((t) => t.id !== id) : undefined, result: undefined }));
  }

  /**
   * ### clearDone
   *
   * Deletes every checked-off to-do.
   *
   * @returns How many were deleted.
   */
  clearDone(): Promise<number> {
    return this.#change((todos) => {
      const open = todos.filter((t) => !t.done);
      return { todos: open.length === todos.length ? undefined : open, result: todos.length - open.length };
    });
  }
}

/**
 * ### todoIdSchema
 *
 * Checks that an id from a URL looks like one the store made.
 */
export const todoIdSchema = z.uuid({ error: "Not a to-do id" });
