import { reviewInboxNow } from "@/composition/server";

/**
 * ### POST
 *
 * Has Claude review the Inbox now, even if it already did today.
 *
 * @returns The `InboxView` with its moves; 502 when the review fails.
 */
export async function POST(): Promise<Response> {
  try {
    return Response.json(await reviewInboxNow());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
