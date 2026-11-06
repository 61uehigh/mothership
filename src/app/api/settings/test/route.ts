import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { CONNECTIONS } from "@/features/settings/model/Settings";
import { getSettingsService } from "@/composition/server";

const bodySchema = z.object({ id: z.enum(CONNECTIONS) });

/**
 * ### POST
 *
 * Tries a connection by loading its sidebar section fresh. Body: `{ id }`.
 * Through a claude.ai connector this uses a little Claude usage.
 *
 * @returns `ConnectionTest`: `{ ok: true, items }` or `{ ok: false, message }` (or `unavailable` when the tool is not set up).
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  return Response.json(await getSettingsService().test(body.id));
}
