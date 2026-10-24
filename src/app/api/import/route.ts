import { forkSession } from "@anthropic-ai/claude-agent-sdk";
import { connection } from "next/server";
import { z } from "zod";
import { parseBody, parseQuery } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";
import { listImportable, readHistory } from "@/features/sessions/server/sessionImport";

const PROVIDER = z.enum(["claude", "codex"]);
const querySchema = z.object({ provider: PROVIDER });
const bodySchema = z.object({ provider: PROVIDER, id: z.string().trim().min(1).max(200) });

/**
 * ### GET
 *
 * Recent local sessions that can be imported. `?provider=claude|codex`.
 *
 * @returns `{ sessions: Array<ImportableSession> }`, newest first.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    return Response.json({ sessions: await listImportable(query.provider) });
  } catch (error) {
    return Response.json({ error: `Could not list ${query.provider} sessions: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

/**
 * ### POST
 *
 * Imports a local session as a lead session. Body: `{ provider, id }`. A
 * Claude Code session is forked so the original is left as it was.
 *
 * @returns The new agent (201), 400 for an invalid body, 404 when the session
 *   is not among the recent ones, 502 when it cannot be read or forked.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  const session = (await listImportable(body.provider)).find((s) => s.id === body.id);
  if (session === undefined) return Response.json({ error: "That session is not among the recent ones" }, { status: 404 });
  try {
    const history = await readHistory(session.provider, session.id);
    const sessionRef =
      session.provider === "claude" ? (await forkSession(session.id, { title: `${session.title} (mothership)` })).sessionId : session.id;
    const agent = await getRuntime().importSession(session, history, sessionRef);
    return Response.json(agent, { status: 201 });
  } catch (error) {
    return Response.json({ error: `Could not import the session: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
