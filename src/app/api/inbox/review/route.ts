import { getInbox } from "@/composition/server";
import { errorMessage } from "@/lib/errors";

/**
 * ### POST
 *
 * Has Claude review the Inbox now, even if it already did today.
 *
 * @returns The `InboxView` with its moves; 502 when the review fails.
 */
export async function POST(): Promise<Response> {
  try {
    return Response.json(await getInbox().reviewNow());
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }
}
