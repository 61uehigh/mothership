import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { routeContainer } from "@/app/api/docker/_lib/routeContainer";
import { inspectContainer } from "@/features/docker/server/docker";

/**
 * ### GET
 *
 * @returns The container's {@link import("@/features/docker/model/Docker").ContainerDetail}
 *   (environment variable names only), 400 for an invalid id, 404 for an
 *   unknown container, or `{ error, code }` when docker fails.
 */
export async function GET(_request: Request, context: RouteContext<"/api/docker/containers/[id]">): Promise<Response> {
  await connection();
  const container = await routeContainer(context.params);
  if (container instanceof Response) return container;
  try {
    return Response.json(await inspectContainer(container.id));
  } catch (error) {
    return errorResponse(error);
  }
}
