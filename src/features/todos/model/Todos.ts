import { z } from "zod";

const day = z.iso.date({ error: "Dates look like 2026-11-09" });

/**
 * ### isTodoDay
 *
 * Whether `text` is a day a to-do accepts as `due` or `plannedFor`: a real
 * calendar date written `YYYY-MM-DD` (so 2026-11-31 is not one).
 */
export const isTodoDay = (text: string): boolean => day.safeParse(text).success;

/**
 * ### TODO_TITLE_MAX
 *
 * Longest to-do title, in characters.
 */
export const TODO_TITLE_MAX = 500;

/**
 * ### TODO_BODY_MAX
 *
 * Longest to-do body (its notes), in characters.
 */
export const TODO_BODY_MAX = 20_000;

const title = z.string().trim().min(1, "Write what to do").max(TODO_TITLE_MAX);
const body = z.string().max(TODO_BODY_MAX, `Notes can be at most ${TODO_BODY_MAX} characters`);

/** A follow-up added from a meeting summary. */
const meetingSourceSchema = z.object({
  kind: z.literal("meeting"),
  /** Nuclino item UUID of the note. */
  itemId: z.uuid(),
  title: z.string(),
});

/** A bullet of your Daily Scrum post in Slack, imported as done (see `scrumDoneItems`). */
const scrumSourceSchema = z.object({
  kind: z.literal("slack-scrum"),
  /** The post's permalink. */
  url: z.string(),
  /** Same bullet, same key: importing again adds nothing twice. */
  key: z.string(),
  /** Guessed from that day's plan rather than reported. */
  inferred: z.boolean(),
});

/**
 * ### todoSourceSchema
 *
 * Where a to-do came from, so it can open that again: a meeting's notes, or
 * a Daily Scrum post.
 */
const todoSourceSchema = z.discriminatedUnion("kind", [meetingSourceSchema, scrumSourceSchema]);

/**
 * ### TodoSource
 *
 * See {@link todoSourceSchema}.
 */
export type TodoSource = z.infer<typeof todoSourceSchema>;

/**
 * ### todoSchema
 *
 * One to-do, as saved in `.mothership/todos.json`. Files written before
 * to-dos had notes, a plan day, or a session still load: the newer fields
 * have defaults.
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
  /** Day it is due, `YYYY-MM-DD`: a deadline. */
  due: day.optional(),
  /** Day you mean to do it, `YYYY-MM-DD`; none means someday. A past day is carried over to today. */
  plannedFor: day.optional(),
  /** How many times it was put off from a day it was meant for (see `replan`). */
  carryCount: z.number().int().min(0).default(0),
  /** Marked as stuck, so the standup lists it under blockers. */
  blocked: z.boolean().default(false),
  source: todoSourceSchema.optional(),
  /** Epoch milliseconds it was added. */
  createdAt: z.number(),
  /** Epoch milliseconds it was checked off. */
  doneAt: z.number().optional(),
  /** `doneAt` names the day only (added as done on a past day, or imported), not a real time. */
  doneDayOnly: z.boolean().default(false),
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
 * picks its id before it is saved, so the tab keeps pointing at it. `doneOn`
 * records something already done on that day.
 */
export const newTodoSchema = z.object({
  id: z.uuid({ error: "Not a to-do id" }).optional(),
  text: title,
  body: body.optional(),
  due: day.optional(),
  plannedFor: day.optional(),
  /** Adds it already checked off on this day: something done that was never on the list. */
  doneOn: day.optional(),
  /** With `doneOn`: when it was done, if known (a pull request or session it was added from). */
  doneAt: z.number().int().optional(),
  source: meetingSourceSchema.optional(),
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
 * clears the date, `plannedFor: null` moves it to someday, and `sessionId: null`
 * forgets the session.
 */
export const todoChangeSchema = z
  .object({
    text: title,
    body,
    done: z.boolean(),
    due: day.nullable(),
    plannedFor: day.nullable(),
    blocked: z.boolean(),
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
 * ### doneTimeKnown
 *
 * Whether `doneAt` is when it was really checked off. Imported Daily Scrum
 * items predate the `doneDayOnly` flag, so their source says so too.
 */
export function doneTimeKnown(todo: Pick<Todo, "doneDayOnly" | "source">): boolean {
  return !todo.doneDayOnly && todo.source?.kind !== "slack-scrum";
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
  if (typed !== "") return typed.slice(0, TODO_TITLE_MAX);
  const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
  return firstLine.trim().replace(/^#+\s*/, "").slice(0, TODO_TITLE_MAX);
}

/**
 * ### todoSessionMessage
 *
 * @returns The first message of the session started for `todo`: its title, then its notes.
 */
export function todoSessionMessage(todo: Pick<Todo, "text" | "body">): string {
  return todo.body.trim() === "" ? todo.text : `${todo.text}\n\n${todo.body.trim()}`;
}

/**
 * ### followUpTodo
 *
 * The to-do to add for a meeting follow-up Claude wrote, fitted to
 * {@link newTodoSchema}: a due date that is a real day becomes the to-do's;
 * anything vaguer ("next week", 2026-11-31) is kept in the title through
 * `wordDue`, and the title is cut to {@link TODO_TITLE_MAX}.
 *
 * @param wordDue - Words the title with a due date that is not a day, in the UI's language.
 * @returns The to-do's title and due day, or `undefined` when there is nothing to do.
 */
export function followUpTodo(
  action: { what: string; due?: string },
  wordDue: (what: string, due: string) => string,
): { text: string; due?: string } | undefined {
  const what = action.what.trim();
  if (what === "") return undefined;
  const due = action.due?.trim() ?? "";
  if (due === "") return { text: what.slice(0, TODO_TITLE_MAX) };
  if (isTodoDay(due)) return { text: what.slice(0, TODO_TITLE_MAX), due };
  return { text: wordDue(what, due).trim().slice(0, TODO_TITLE_MAX) };
}
