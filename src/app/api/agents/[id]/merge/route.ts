import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getRuntime } from "@/composition/server";

const bodySchema = z.object({ message: z.string().trim().min(1).max(500) });

/**
 * ### POST
 *
 * Merges the agent's worktree into its base branch in the user's checkout;
 * in a comparison group, also discards the other attempts.
 *
 * @returns `{ commit }`, or 409 with the reason when git or the runtime refuses.
 */
export async function POST(request: Request, context: RouteContext<"/api/agents/[id]/merge">): Promise<Response> {
  const { id } = await context.params;
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    return Response.json({ commit: await getRuntime().merge(id, body.message) });
  } catch (error) {
    return errorResponse(error);
  }
}
