import { z } from "zod";

const day = z.iso.date({ error: "due must be a date like 2026-11-09" });

/** Longest to-do title, in characters. */
const TEXT_MAX = 500;

/**
 * ### TODO_BODY_MAX
 *
 * Longest to-do body (its notes), in characters.
 */
export const TODO_BODY_MAX = 20_000;

const title = z.string().trim().min(1, "Write what to do").max(TEXT_MAX);
const body = z.string().max(TODO_BODY_MAX, `Notes can be at most ${TODO_BODY_MAX} characters`);

/**
 * ### todoSourceSchema
 *
 * Where a to-do came from, so it can open that again. Only meeting notes for now.
 */
const todoSourceSchema = z.object({
  kind: z.literal("meeting"),
  /** Nuclino item UUID of the note. */
  itemId: z.uuid(),
  title: z.string(),
});

/**
 * ### todoSchema
 *
 * One to-do, as saved in `.mothership/todos.json`. Files written before
 * to-dos had notes or a session still load: `body` defaults to empty.
 */
export const todoSchema = z.object({
  id: z.string(),
  /** The title: one line. */
  text: z.string().min(1),
  /** Notes under the title, plain text or Markdown; empty when there are none. */
  body: z.string().default(""),
  /** The one session started for this to-do (an agent id), once there is one. */
  sessionId: z.string().min(1).optional(),
  done: z.boolean(),
  /** Day it is due, `YYYY-MM-DD`. */
  due: day.optional(),
  source: todoSourceSchema.optional(),
  /** Epoch milliseconds it was added. */
  createdAt: z.number(),
  /** Epoch milliseconds it was checked off. */
  doneAt: z.number().optional(),
});

/**
 * ### Todo
 *
 * See {@link todoSchema}.
 */
export type Todo = z.infer<typeof todoSchema>;

/**
 * ### newTodoSchema
 *
 * Body of `POST /api/todos`. `id` is optional: a to-do written in its own tab
 * picks its id before it is saved, so the tab keeps pointing at it.
 */
export const newTodoSchema = z.object({
  id: z.uuid({ error: "Not a to-do id" }).optional(),
  text: title,
  body: body.optional(),
  due: day.optional(),
  source: todoSourceSchema.optional(),
});

/**
 * ### NewTodo
 *
 * See {@link newTodoSchema}.
 */
export type NewTodo = z.infer<typeof newTodoSchema>;

/**
 * ### todoChangeSchema
 *
 * Body of `PATCH /api/todos/[id]`: only the fields it names change; `due: null`
 * clears the date and `sessionId: null` forgets the session.
 */
export const todoChangeSchema = z
  .object({
    text: title,
    body,
    done: z.boolean(),
    due: day.nullable(),
    sessionId: z.string().min(1).nullable(),
  })
  .partial();

/**
 * ### TodoChange
 *
 * See {@link todoChangeSchema}.
 */
export type TodoChange = z.infer<typeof todoChangeSchema>;

/**
 * ### sortTodos
 *
 * Open to-dos first: those with a due date by date, then the rest newest
 * first. Done ones after, most recently checked first.
 */
export function sortTodos(todos: Array<Todo>): Array<Todo> {
  const rank = (t: Todo) => (t.done ? 2 : t.due === undefined ? 1 : 0);
  return [...todos].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.done) return (b.doneAt ?? 0) - (a.doneAt ?? 0);
    if (a.due !== undefined && b.due !== undefined && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

/**
 * ### todoTitleFrom
 *
 * The title to save for what is typed in a to-do's tab: the title as typed,
 * else the first line of the notes, so notes written before a title are kept.
 *
 * @returns The title, or `""` when both are empty.
 */
export function todoTitleFrom(title: string, body: string): string {
  const typed = title.trim();
  if (typed !== "") return typed.slice(0, TEXT_MAX);
  const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
  return firstLine.trim().replace(/^#+\s*/, "").slice(0, TEXT_MAX);
}

/**
 * ### todoSessionMessage
 *
 * @returns The first message of the session started for `todo`: its title, then its notes.
 */
export function todoSessionMessage(todo: Pick<Todo, "text" | "body">): string {
  return todo.body.trim() === "" ? todo.text : `${todo.text}\n\n${todo.body.trim()}`;
}
