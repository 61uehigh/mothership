import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { routeContainer } from "@/app/api/docker/_lib/routeContainer";
import { runContainerAction } from "@/features/docker/server/docker";
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
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const container = await routeContainer(context.params);
  if (container instanceof Response) return container;
  try {
    await runContainerAction(container.id, body.action);
    return Response.json({ id: container.id, action: body.action });
  } catch (error) {
    return errorResponse(error);
  }
}
