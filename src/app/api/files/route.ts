import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getFiles } from "@/composition/server";

const querySchema = z.object({ root: z.string().min(1) });

/**
 * ### GET
 *
 * Lists files for the explorer. `?root=` is an agent id (its working
 * directory) or `workspace`.
 *
 * @returns `FileListing`: `{ root, files, status }`, 400 for a missing root,
 *   or 404 for an unknown agent or a folder that no longer exists.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await getFiles().listFiles(query.root));
  } catch (error) {
    return errorResponse(error);
  }
}
