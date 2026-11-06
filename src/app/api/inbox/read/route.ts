import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { getInbox } from "@/composition/server";

const bodySchema = z.object({
  /** `readKey`s of Inbox items. */
  keys: z.array(z.string().min(1).max(2000)).min(1).max(2000),
  read: z.boolean(),
  /** Linear notifications to mark the same way in Linear. */
  linearIds: z.array(z.string().min(1).max(200)).max(200).optional(),
});

/**
 * ### POST
 *
 * Marks Inbox items read or unread in mothership, and `linearIds` the same
 * way in Linear.
 *
 * @returns The `InboxView` with the change; 400 for an invalid body.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  return Response.json(await getInbox().mark(body.keys, body.read, body.linearIds));
}
