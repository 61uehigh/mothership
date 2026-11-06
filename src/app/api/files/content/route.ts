import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getFiles } from "@/composition/server";

const querySchema = z.object({ root: z.string().min(1), path: z.string().min(1) });

/**
 * ### GET
 *
 * One file, highlighted for the file viewer. `?root=` is an agent id or
 * `workspace`; `?path=` is relative to it.
 *
 * @returns `FileContent`: `{ path, language, html, lines, truncated, status }`;
 *   400 for invalid params or a path outside the root, 404 for an unknown
 *   root or missing file, 415 for a binary file.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await getFiles().readFileContent(query.root, query.path));
  } catch (error) {
    return errorResponse(error);
  }
}
