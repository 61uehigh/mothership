import { connection } from "next/server";
import { z } from "zod";
import { parseBody, parseQuery } from "@/app/api/_lib/http";
import { repoSlugSchema } from "@/features/github/server/GitHub";
import { defaultFolder, sessionFolders } from "@/composition/server";
import { changeRepos, listRepos } from "@/features/github/server/repoChoices";

const querySchema = z.object({
  /** One more local directory to check, e.g. a checkout no agent uses yet. */
  dir: z.string().trim().min(1).optional(),
});

const bodySchema = z.object({
  action: z.enum(["add", "remove", "restore"]),
  repo: repoSlugSchema,
});

/** Sessions' folders and the default folder, where local checkouts may be. */
async function localFolders(): Promise<Array<string>> {
  return [...sessionFolders(), await defaultFolder()];
}

/**
 * ### GET
 *
 * The GitHub section's repositories: local checkouts (repositories.yaml,
 * session folders, the workspace) minus ones you removed, plus ones you added
 * from your account. `?dir=` checks one more local directory.
 *
 * @returns `RepoList`: `{ repos, hidden }`, or 400 for an invalid query.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json(await listRepos([...(query.dir === undefined ? [] : [query.dir]), ...(await localFolders())]));
}

/**
 * ### POST
 *
 * Adds a repository from your account, removes one from the list, or restores
 * a removed local one. Body: `{ action: "add" | "remove" | "restore", repo }`.
 *
 * @returns The updated `RepoList`, or 400 for an invalid body.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  await changeRepos(body.action, body.repo);
  return Response.json(await listRepos(await localFolders()));
}
