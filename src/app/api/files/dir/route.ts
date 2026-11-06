import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getFiles } from "@/composition/server";

const querySchema = z.object({
  root: z.string().min(1),
  path: z.string().default(""),
  hidden: z.enum(["0", "1"]).default("0"),
});

/**
 * ### GET
 *
 * One folder's direct children, for Finder-style browsing. `?root=` is an
 * agent id, `workspace`, or `local` (the home folder); `?path=` is the folder
 * relative to it (empty for the root); `?hidden=1` includes dot files.
 *
 * @returns `DirectoryListing`: `{ absolute, path, entries }`; 400 for a path
 *   outside the root, 403 for a secret folder, 404 for a missing folder.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await getFiles().listDirectory(query.root, query.path, query.hidden === "1"));
  } catch (error) {
    return errorResponse(error);
  }
}
