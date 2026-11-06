import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getPullRequest, repoSlugSchema } from "@/features/github/server/GitHub";

const querySchema = z.object({
  repo: repoSlugSchema,
  number: z.coerce.number().int().positive(),
});

/**
 * ### GET
 *
 * `?repo=owner/name&number=N`
 *
 * @returns The {@link import("@/features/github/model/GitHub").PullRequest}, 400 for
 *   an invalid query, or `{ error, code }` when gh fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await getPullRequest(query.repo, query.number));
  } catch (error) {
    return errorResponse(error);
  }
}
