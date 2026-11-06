import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getPrSummaries } from "@/composition/server";
import { repoSlugSchema } from "@/features/github/server/ghSchemas";

const querySchema = z.object({
  repo: repoSlugSchema,
  number: z.coerce.number().int().positive(),
  fresh: z.enum(["1"]).optional(),
});

/**
 * ### GET
 *
 * `?repo=owner/name&number=N`: Claude's summary of the pull request for
 * reviewing it (changes, decisions, implementation, where to look). Saved
 * per head commit, so it is made again only after a push or with `?fresh=1`.
 *
 * @returns `PrSummaryView`, 400 for an invalid query, `{ error, code }` when
 *   gh or Claude fails (Claude's coded as `askClaudeJson` codes them), or 502
 *   when git fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await getPrSummaries().summary(query.repo, query.number, query.fresh === "1"));
  } catch (error) {
    // Anything else is Claude, `gh`, or git failing.
    return errorResponse(error, 502);
  }
}
