import { z } from "zod";

const day = z.iso.date({ error: "due must be a date like 2026-11-09" });

/**
 * ### todoSourceSchema
 *
 * Where a to-do came from, so it can open that again. Only meeting notes for now.
 */
export const todoSourceSchema = z.object({
  kind: z.literal("meeting"),
  /** Nuclino item UUID of the note. */
  itemId: z.uuid(),
  title: z.string(),
});

/**
 * ### todoSchema
 *
 * One to-do, as saved in `.mothership/todos.json`.
 */
export const todoSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
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
 * Body of `POST /api/todos`.
 */
export const newTodoSchema = z.object({
  text: z.string().trim().min(1, "Write what to do").max(500),
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
 * Body of `PATCH /api/todos/[id]`: only the fields it names change; `due: null` clears the date.
 */
export const todoChangeSchema = z
  .object({
    text: z.string().trim().min(1, "Write what to do").max(500),
    done: z.boolean(),
    due: day.nullable(),
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
