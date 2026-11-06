import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { SETUP_ACTIONS, type SetupAction } from "@/features/settings/server/setupActions";

// `Object.keys` widens to `string[]`; these are exactly the keys of SETUP_ACTIONS.
const bodySchema = z.object({ action: z.enum(Object.keys(SETUP_ACTIONS) as [SetupAction, ...Array<SetupAction>]) });

/**
 * ### POST
 *
 * Starts a setup step on this Mac: a login in Terminal, or starting Docker.
 * Body: `{ action }`, one of the fixed actions; never a command.
 *
 * @returns 204, or 400 for an unknown action; 501 off macOS.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await SETUP_ACTIONS[body.action]();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
