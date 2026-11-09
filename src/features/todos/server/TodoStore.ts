import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { replan, rollOver } from "@/features/todos/model/Daily";
import { localDay } from "@/lib/dates";
import { sortTodos, todoSchema, type NewTodo, type Todo, type TodoChange, type TodoSource } from "@/features/todos/model/Todos";
import { writeQueueFor, toJsonFile, writeFileAtomic } from "@/platform/files";
import { HttpError } from "@/platform/http/HttpError";
import { isMissingFile } from "@/lib/errors";

/** When something done on `day` is checked off: now if that is today, else 18:00 local that day (the hour is not known). */
function doneAtOn(day: string): number {
  return day === localDay(Date.now()) ? Date.now() : new Date(`${day}T18:00:00`).getTime();
}

/**
 * ### TodoStore
 *
 * Your to-dos, kept in one JSON file. Writes go one at a time and replace
 * the file whole, so a crash never leaves half a list.
 */
export class TodoStore {
  readonly #file: string;
  #todos: Array<Todo> | undefined;
  /** Entries in the file that do not parse (a hand edit, a newer version's fields), written back unchanged with every save. */
  #unparsed: Array<unknown> = [];

  /** @param file - Absolute path of the JSON file, e.g. `dataPath(".mothership", "todos.json")`. */
  constructor(file: string) {
    this.#file = file;
  }

  /**
   * @throws HttpError 409 `todos-file-unreadable` when the file exists but cannot be read, or `todos-file-invalid` when it is not a JSON list (a hand edit gone wrong, for you to fix); nothing is cached, so the next call tries again.
   */
  async #load(): Promise<Array<Todo>> {
    if (this.#todos === undefined) {
      let text: string;
      try {
        text = await readFile(this.#file, "utf8");
      } catch (error) {
        if (!isMissingFile(error)) {
          throw new HttpError(`Could not read the to-do list at ${this.#file}`, 409, "todos-file-unreadable", { cause: error, params: { file: this.#file } });
        }
        text = "[]";
      }
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (error) {
        throw new HttpError(`The to-do list at ${this.#file} is not valid JSON; fix or move it to start again`, 409, "todos-file-invalid", { cause: error, params: { file: this.#file } });
      }
      if (!Array.isArray(raw)) throw new HttpError(`The to-do list at ${this.#file} is not a list; fix or move it to start again`, 409, "todos-file-invalid", { params: { file: this.#file } });
      // Parsing fills fields older files lack (an empty body).
      const todos: Array<Todo> = [];
      const unparsed: Array<unknown> = [];
      for (const entry of raw) {
        const parsed = todoSchema.safeParse(entry);
        if (parsed.success) todos.push(parsed.data);
        else unparsed.push(entry);
      }
      this.#todos = todos;
      this.#unparsed = unparsed;
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
        await writeFileAtomic(this.#file, toJsonFile([...todos, ...this.#unparsed]));
      }
      return result;
    });
  }

  /**
   * ### list
   *
   * Carries open to-dos planned for a past day over to today first (saving
   * only when one moved), so every reader sees the same plan.
   *
   * @returns Every to-do, in the order `sortTodos` gives.
   */
  async list(): Promise<Array<Todo>> {
    const today = localDay(Date.now());
    return sortTodos(
      await this.#change((todos) => {
        const carried = rollOver(todos, today);
        return { todos: carried, result: carried ?? todos };
      }),
    );
  }

  /**
   * ### add
   *
   * @returns The new to-do.
   * @throws HttpError 409 when `input.id` is already taken.
   */
  add(input: NewTodo): Promise<Todo> {
    return this.#change((todos) => {
      if (input.id !== undefined && todos.some((t) => t.id === input.id)) throw new HttpError("That to-do already exists", 409, "todo-exists");
      const todo: Todo = {
        id: input.id ?? randomUUID(),
        text: input.text,
        body: input.body ?? "",
        done: input.doneOn !== undefined,
        ...(input.doneOn === undefined ? {} : { doneAt: input.doneAt ?? doneAtOn(input.doneOn) }),
        doneDayOnly: input.doneOn !== undefined && input.doneAt === undefined && input.doneOn !== localDay(Date.now()),
        carryCount: 0,
        blocked: false,
        createdAt: Date.now(),
        ...(input.due === undefined ? {} : { due: input.due }),
        ...(input.plannedFor === undefined ? {} : { plannedFor: input.plannedFor }),
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
      if (current === undefined) throw new HttpError("No such to-do", 404, "todo-not-found");
      const { due, sessionId, plannedFor, ...rest } = { ...current, ...change };
      const plan = plannedFor === undefined || plannedFor === current.plannedFor ? { plannedFor, carryCount: current.carryCount } : replan(current, plannedFor, localDay(Date.now()));
      const next: Todo = {
        ...rest,
        carryCount: plan.carryCount,
        ...(plan.plannedFor === undefined ? {} : { plannedFor: plan.plannedFor }),
        ...(due === null || due === undefined ? {} : { due }),
        ...(sessionId === null || sessionId === undefined ? {} : { sessionId }),
      };
      // Done is done: a to-do checked off is no longer stuck.
      if (change.done === true) next.blocked = false;
      if (change.done === true && !current.done) next.doneAt = Date.now();
      if (change.done === false) delete next.doneAt;
      // Checked off (or reopened) here, so the time is real again.
      if (change.done !== undefined && change.done !== current.done) next.doneDayOnly = false;
      return { todos: todos.map((t) => (t.id === id ? next : t)), result: next };
    });
  }

  /**
   * ### importDone
   *
   * Adds checked-off to-dos from elsewhere (Daily Scrum posts), skipping any
   * whose source `key` is already in the list, so importing twice adds
   * nothing twice and keeps your edits to earlier imports.
   *
   * @returns How many were added and skipped.
   */
  importDone(items: Array<{ text: string; body: string; doneAt: number; source: Extract<TodoSource, { kind: "slack-scrum" }> }>): Promise<{ added: number; skipped: number }> {
    return this.#change((todos) => {
      const keys = new Set(todos.flatMap((t) => (t.source?.kind === "slack-scrum" ? [t.source.key] : [])));
      const fresh = items.filter((item) => !keys.has(item.source.key) && (keys.add(item.source.key), true));
      const added: Array<Todo> = fresh.map((item) => ({
        id: randomUUID(),
        text: item.text,
        body: item.body,
        done: true,
        doneAt: item.doneAt,
        doneDayOnly: true,
        carryCount: 0,
        blocked: false,
        createdAt: Date.now(),
        source: item.source,
      }));
      return { todos: added.length === 0 ? undefined : [...todos, ...added], result: { added: added.length, skipped: items.length - added.length } };
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
