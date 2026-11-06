import { z } from "zod";
import { errorResponse, orNotFound } from "@/app/api/_lib/http";
import type { ContainerSummary } from "@/features/docker/model/Docker";
import { containerRefSchema, findContainer } from "@/features/docker/server/docker";

/**
 * ### routeContainer
 *
 * The container a `/api/docker/containers/[id]/…` route names, looked up
 * against the current list so a route only ever acts on one that exists.
 *
 * @param params - The route's `params`, whose `id` is a container id, unique id prefix, or name.
 * @returns The container, or a response to return as-is: 400 for an invalid
 *   id, 404 (`container-not-found`) for an unknown one, or `{ error, code }`
 *   when docker fails.
 */
export async function routeContainer(params: Promise<{ id: string }>): Promise<ContainerSummary | Response> {
  const ref = containerRefSchema.safeParse((await params).id);
  if (!ref.success) return Response.json({ error: z.prettifyError(ref.error) }, { status: 400 });
  try {
    return orNotFound(await findContainer(ref.data), "container-not-found");
  } catch (error) {
    return errorResponse(error);
  }
}
