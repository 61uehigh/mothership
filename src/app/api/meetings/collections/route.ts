import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { meetingCollectionChoices } from "@/composition/server";

const querySchema = z.object({
  parent: z.uuid().optional(),
  /** Names of `parent` and its parents, outermost first, joined by ` / `. */
  path: z.string().optional(),
});

/**
 * ### GET
 *
 * Collections to choose from for Settings → Meetings. Without `?parent=`,
 * the Nuclino workspaces; with it, the collections directly inside that
 * workspace or collection.
 *
 * @returns Choices; 409 when Nuclino is not set up, 502 when the call fails.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json(await meetingCollectionChoices(query.parent, query.path === undefined || query.path === "" ? [] : query.path.split(" / ")));
  } catch (error) {
    return errorResponse(error);
  }
}
