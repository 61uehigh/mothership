import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { listContainers } from "@/features/docker/server/Docker";

/**
 * ### GET
 *
 * @returns `{ containers }`: every container from `docker ps -a` (see
 *   {@link import("@/features/docker/model/Docker").ContainerSummary}), or
 *   `{ error, code }` when docker fails.
 */
export async function GET(): Promise<Response> {
  await connection();
  try {
    return Response.json({ containers: await listContainers() });
  } catch (error) {
    return errorResponse(error);
  }
}
