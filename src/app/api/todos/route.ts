import { connection } from "next/server";
import { z } from "zod";
import { parseBody, parseQuery } from "@/app/api/_lib/http";
import { getTodos } from "@/composition/server";
import { newTodoSchema } from "@/features/todos/model/Todos";

/**
 * ### GET
 *
 * @returns `Array<Todo>`: open to-dos by due date, then done ones.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getTodos().list());
}

/**
 * ### POST
 *
 * Adds a to-do (`NewTodo`).
 *
 * @returns The new `Todo`, 201.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, newTodoSchema);
  if (body instanceof Response) return body;
  return Response.json(await getTodos().add(body), { status: 201 });
}

const deleteQuery = z.object({ done: z.literal("1", { error: "Only ?done=1 (clear checked-off to-dos) is supported" }) });

/**
 * ### DELETE
 *
 * `?done=1` deletes every checked-off to-do.
 *
 * @returns `{ deleted }`.
 */
export async function DELETE(request: Request): Promise<Response> {
  const query = parseQuery(request, deleteQuery);
  if (query instanceof Response) return query;
  return Response.json({ deleted: await getTodos().clearDone() });
}
