import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { ALL_REPOSITORIES } from "@/features/github/model/GitHub";
import { getAllOverview, getOverview, repoSlugSchema } from "@/features/github/server/GitHub";

const querySchema = z.object({
  /** `owner/name`, or `*` for every repository (see ALL_REPOSITORIES). */
  repo: z.union([z.literal(ALL_REPOSITORIES), repoSlugSchema]),
  /** `1` bypasses the one-minute cache. */
  refresh: z.enum(["0", "1"]).optional(),
});

/**
 * ### GET
 *
 * `?repo=owner/name[&refresh=1]`, or `?repo=*` for every repository.
 *
 * @returns The repository's {@link import("@/features/github/model/GitHub").Overview},
 *   400 for an invalid query, or `{ error, code }` when gh fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    const refresh = query.refresh === "1";
    return Response.json(query.repo === ALL_REPOSITORIES ? await getAllOverview(refresh) : await getOverview(query.repo, refresh));
  } catch (error) {
    return errorResponse(error);
  }
}
