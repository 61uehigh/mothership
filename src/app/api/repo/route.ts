import { z } from "zod";
import { parseQuery } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const querySchema = z.object({
  /** An empty `?dir=` means "use the default folder". */
  dir: z
    .string()
    .trim()
    .optional()
    .transform((dir) => (dir === "" ? undefined : dir)),
});

/**
 * ### GET
 *
 * Checks a directory for the new-agent form. `?dir=` defaults to the
 * configured workspace.
 *
 * @returns `{ root }`: the git repository root, or `null` when `dir` is not in a repository.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json({ root: (await getRuntime().repoFor(query.dir)) ?? null });
}
