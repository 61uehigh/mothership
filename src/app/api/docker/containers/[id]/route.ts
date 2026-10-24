import { connection } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/app/api/_lib/http";
import { containerRefSchema, findContainer, inspectContainer } from "@/features/docker/server/Docker";

/**
 * ### GET
 *
 * @returns The container's {@link import("@/features/docker/model/Docker").ContainerDetail}
 *   (environment variable names only), 400 for an invalid id, 404 for an
 *   unknown container, or `{ error, code }` when docker fails.
 */
export async function GET(_request: Request, context: RouteContext<"/api/docker/containers/[id]">): Promise<Response> {
  await connection();
  const ref = containerRefSchema.safeParse((await context.params).id);
  if (!ref.success) return Response.json({ error: z.prettifyError(ref.error) }, { status: 400 });
  try {
    const container = await findContainer(ref.data);
    if (container === undefined) return Response.json({ error: "No such container" }, { status: 404 });
    return Response.json(await inspectContainer(container.id));
  } catch (error) {
    return errorResponse(error);
  }
}
