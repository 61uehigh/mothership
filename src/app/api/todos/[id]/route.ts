import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getTodos } from "@/composition/server";
import { todoChangeSchema } from "@/features/todos/model/Todos";
import { todoIdSchema } from "@/features/todos/server/TodoStore";

async function todoId(context: RouteContext<"/api/todos/[id]">): Promise<string | Response> {
  const parsed = todoIdSchema.safeParse((await context.params).id);
  return parsed.success ? parsed.data : Response.json({ error: "Not a to-do id" }, { status: 400 });
}

/**
 * ### PATCH
 *
 * Changes a to-do's title, notes, done state, due date, or linked session (`TodoChange`).
 *
 * @returns The changed `Todo`; 404 when it does not exist.
 */
export async function PATCH(request: Request, context: RouteContext<"/api/todos/[id]">): Promise<Response> {
  const id = await todoId(context);
  if (id instanceof Response) return id;
  const body = await parseBody(request, todoChangeSchema);
  if (body instanceof Response) return body;
  try {
    return Response.json(await getTodos().update(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * ### DELETE
 *
 * Deletes a to-do; deleting one that is already gone succeeds.
 *
 * @returns 204; 409 when the to-do file can't be read.
 */
export async function DELETE(_request: Request, context: RouteContext<"/api/todos/[id]">): Promise<Response> {
  const id = await todoId(context);
  if (id instanceof Response) return id;
  try {
    await getTodos().remove(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
