import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getPullRequestDiff, repoSlugSchema } from "@/features/github/server/GitHub";

const querySchema = z.object({
  repo: repoSlugSchema,
  number: z.coerce.number().int().positive(),
});

/**
 * ### GET
 *
 * `?repo=owner/name&number=N`
 *
 * @returns The pull request's unified diff (`text/plain`), 400 for an
 *   invalid query, or `{ error, code }` when gh fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    const diff = await getPullRequestDiff(query.repo, query.number);
    return new Response(diff, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error) {
    return errorResponse(error);
  }
}
