import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { SETUP_ACTIONS } from "@/features/settings/model/Settings";
import { SETUP_COMMANDS } from "@/features/settings/server/setupActions";

const bodySchema = z.object({ action: z.enum(SETUP_ACTIONS) });

/**
 * ### POST
 *
 * Starts a setup step on this computer: a login in a terminal, or starting
 * Docker. Body: `{ action }`, one of the fixed actions; never a command.
 *
 * @returns 204, or 400 for an unknown action; 404 (`docker-desktop-missing`)
 *   when Docker Desktop isn't installed; 501 on systems other than macOS and
 *   Windows; 500 with `{ error }` when the step could not be started.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await SETUP_COMMANDS[body.action]();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
