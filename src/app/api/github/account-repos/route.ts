import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { listAccountRepos } from "@/features/github/server/repoChoices";

const querySchema = z.object({ refresh: z.enum(["0", "1"]).optional() });

/**
 * ### GET
 *
 * Repositories you can add to the GitHub section: yours and your
 * organizations', most recently updated first. `?refresh=1` skips the
 * five-minute cache.
 *
 * @returns `{ repos: Array<AccountRepo> }`, or `{ error, code }` when gh fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json({ repos: await listAccountRepos(query.refresh === "1") });
  } catch (error) {
    return errorResponse(error);
  }
}
