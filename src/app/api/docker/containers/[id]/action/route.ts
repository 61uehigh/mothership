import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { containerRefSchema, findContainer, runContainerAction } from "@/features/docker/server/Docker";
import { CONTAINER_ACTIONS } from "@/features/docker/model/Docker";

const bodySchema = z.object({ action: z.enum(CONTAINER_ACTIONS) });

/**
 * ### POST
 *
 * Starts, stops, or restarts a container (`{ action: "start" | "stop" | "restart" }`).
 * The id must name an existing container; nothing else can be run.
 *
 * @returns `{ id, action }`, 400 for an invalid id or body, 404 for an
 *   unknown container, or `{ error, code }` when docker fails.
 */
export async function POST(request: Request, context: RouteContext<"/api/docker/containers/[id]/action">): Promise<Response> {
  const ref = containerRefSchema.safeParse((await context.params).id);
  if (!ref.success) return Response.json({ error: z.prettifyError(ref.error) }, { status: 400 });
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    const container = await findContainer(ref.data);
    if (container === undefined) return Response.json({ error: "No such container" }, { status: 404 });
    await runContainerAction(container.id, body.action);
    return Response.json({ id: container.id, action: body.action });
  } catch (error) {
    return errorResponse(error);
  }
}
