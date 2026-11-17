import { z } from "zod";
import { errorResponse } from "@/app/api/_lib/http";
import { getGmail } from "@/composition/server";

/** Gmail message ids are hexadecimal; demo mode's are words and dashes. */
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/**
 * ### GET
 *
 * @returns The message's `MailDetail`, 400 for a malformed id, or `{ error, code }` when Gmail fails.
 */
export async function GET(_request: Request, context: RouteContext<"/api/gmail/messages/[id]">): Promise<Response> {
  const id = idSchema.safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Not a message id" }, { status: 400 });
  try {
    return Response.json(await getGmail().message(id.data));
  } catch (error) {
    return errorResponse(error);
  }
}
