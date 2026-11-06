import { z } from "zod";
import { parseQuery } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";
import { expandHome, folderProblem } from "@/platform/folders";

const querySchema = z.object({
  /** An empty `?dir=` means "use the default folder". */
  dir: z
    .string()
    .trim()
    .optional()
    .transform((dir) => (dir === "" || dir === undefined ? undefined : expandHome(dir))),
});

/**
 * ### GET
 *
 * Checks a directory for the new-agent form. `?dir=` defaults to the
 * configured workspace.
 *
 * @returns `{ root, problem? }`: the git repository root, or `null` when `dir`
 *   is not in a repository; `problem` (`folder-not-absolute` or `folder-missing`)
 *   when `dir` is no folder to work in, which is an answer here, not a failed request.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  const problem = query.dir === undefined ? undefined : await folderProblem(query.dir);
  if (problem !== undefined) return Response.json({ root: null, problem });
  return Response.json({ root: (await getRuntime().repoFor(query.dir)) ?? null });
}
