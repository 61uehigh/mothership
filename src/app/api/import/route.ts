import { connection } from "next/server";
import { z } from "zod";
import { parseBody, parseQuery } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";
import { importSession, listImportable } from "@/features/sessions/server/import/sessionImport";
import { errorMessage } from "@/lib/errors";
import { folderProblem } from "@/platform/folders";
import { HttpError } from "@/platform/http/HttpError";
import { IMPORT_PROVIDERS } from "@/features/sessions/model/Import";
import type { ImportErrorCode } from "@/lib/apiErrorCodes";

const failure = (code: ImportErrorCode, error: unknown, status: number) => Response.json({ error: errorMessage(error), code }, { status });

const PROVIDER = z.enum(IMPORT_PROVIDERS);
const querySchema = z.object({ provider: PROVIDER });
const bodySchema = z.object({ provider: PROVIDER, id: z.string().trim().min(1).max(200) });

/**
 * ### GET
 *
 * Recent local sessions that can be imported. `?provider=claude|codex`.
 *
 * @returns `{ sessions: Array<ImportableSession> }`, newest first; 502 with
 *   code `list-failed` when they cannot be listed.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json({ sessions: await listImportable(query.provider) });
  } catch (error) {
    return failure("list-failed", error, 502);
  }
}

/**
 * ### POST
 *
 * Imports a local session as a lead session. Body: `{ provider, id }`. A
 * session of a backend that `forksImports` (Claude Code, through its SDK) is
 * forked so the original is left as it was; the fork is deleted again when
 * the import fails.
 *
 * @returns The new agent (201), 400 for an invalid body, 404 (`not-recent`) when
 *   the session is not among the recent ones, 409 (`folder-gone`) when its
 *   folder no longer exists or (`already-imported`) a session that cannot be
 *   forked is already in mothership, 502 (`import-failed`) when it cannot be
 *   read or forked. See `ImportErrorCode`.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const session = (await listImportable(body.provider)).find((s) => s.id === body.id);
  if (session === undefined) return failure("not-recent", "not among the recent sessions", 404);
  // Checked before the fork is made: a session without its folder could never run a turn.
  if (session.cwd !== undefined && (await folderProblem(session.cwd)) !== undefined) return failure("folder-gone", `no folder at ${session.cwd}`, 409);
  const existing = getRuntime().importedAs(session.provider, session.id);
  if (existing !== undefined) return failure("already-imported", `already imported as "${existing.name}"`, 409);
  try {
    const agent = await importSession(session, (history, sessionRef) => getRuntime().importSession(session, history, sessionRef));
    return Response.json(agent, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError && error.code === "already-imported") return failure("already-imported", error, error.status);
    return failure("import-failed", error, 502);
  }
}
