import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { SECRET_NAMES } from "@/features/settings/model/Settings";
import { writeSecret } from "@/features/settings/server/envFile";
import { afterSettingsChange, getSettings } from "@/composition/server";

const bodySchema = z.object({
  name: z.enum(SECRET_NAMES),
  /** Empty clears the variable. */
  value: z.string().max(4096),
});

/**
 * ### PUT
 *
 * Saves one token, key, or path to `.env.local` and applies it at once.
 * Body: `{ name, value }`. The value is never sent back.
 *
 * @returns The updated `SettingsView`; 400 for an unknown name or a value that can't be saved.
 */
export async function PUT(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await writeSecret(body.name, body.value);
  } catch (error) {
    return errorResponse(error);
  }
  // Sections switch source right away instead of serving results from the old one.
  await afterSettingsChange();
  return Response.json(await getSettings().view());
}
