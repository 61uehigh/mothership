import { z } from "zod";
import { parseBody, respondWith } from "@/app/api/_lib/http";
import { respondToEvent } from "@/features/tools/calendar/server/calendarEvent";
import { forgetAfterWrite } from "@/composition/server";
import { calendarSettings } from "@/features/tools/calendar/server/calendarSource";
import { getDashboard } from "@/composition/server";

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
  const dashboard = getDashboard();
  const settings = calendarSettings(await dashboard.config());
  if (settings === undefined) return Response.json({ error: "No calendar widget in config/dashboard.yaml" }, { status: 409 });
  const outcome = await dashboard.callTool("calendar", async (caller) => {
    await respondToEvent(caller, settings, input.eventId, input.response);
    return { ok: true };
  }, { write: true });
  if (outcome.status === "ok") await forgetAfterWrite("calendar");
  return respondWith(outcome, "the reply");
}
