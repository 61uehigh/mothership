import { z } from "zod";
import { errorResponse, parseBody, respondWith } from "@/app/api/_lib/http";
import { respondToEvent } from "@/features/tools/calendar/server/calendarEvent";
import { calendarSetup } from "@/features/tools/calendar/server/calendarRange";
import { forgetAfterWrite, getDashboard } from "@/composition/server";

const bodySchema = z.object({
  eventId: z.string().trim().min(1).max(300),
  response: z.enum(["accepted", "tentative", "declined"]),
});

/**
 * ### POST
 *
 * Replies to a calendar invitation as you. Body: `{ eventId, response }`.
 *
 * @returns `{ ok: true }`; 400 for invalid input, 409 when the calendar is not set up, 502 when it fails.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await parseBody(request, bodySchema);
  if (input instanceof Response) return input;
  try {
    const settings = await calendarSetup(getDashboard());
    const outcome = await getDashboard().callTool("calendar", async (caller) => {
      await respondToEvent(caller, settings, input.eventId, input.response);
      return { ok: true };
    }, { write: true });
    if (outcome.status === "ok") await forgetAfterWrite("calendar");
    return respondWith(outcome, "the reply");
  } catch (error) {
    return errorResponse(error);
  }
}
