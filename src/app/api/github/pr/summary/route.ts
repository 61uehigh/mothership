import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { pullRequestSummary } from "@/composition/server";
import { repoSlugSchema } from "@/features/github/server/GitHub";
import { HttpError } from "@/platform/http/HttpError";

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
 *   gh fails, or 502 when Claude fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await pullRequestSummary(query.repo, query.number, query.fresh === "1"));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
