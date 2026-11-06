import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { OAUTH_CLIENT_MAX_BYTES } from "@/features/settings/model/Settings";
import { removeOAuthClient, saveOAuthClient } from "@/features/settings/server/googleOAuthClient";
import { afterSettingsChange, getSettings } from "@/composition/server";

const bodySchema = z.object({
  /** The text of the OAuth client JSON you chose or dropped. */
  content: z.string().min(1).max(OAUTH_CLIENT_MAX_BYTES),
});

/**
 * ### PUT
 *
 * Saves the Google OAuth client file you chose into the data folder (mode
 * 600) and points `GOOGLE_OAUTH_CREDENTIALS` at it. Body: `{ content }`.
 * The file is never sent back.
 *
 * @returns The updated `SettingsView`; 400 when it is not a Desktop app OAuth client.
 */
export async function PUT(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await saveOAuthClient(body.content);
  } catch (error) {
    return errorResponse(error);
  }
  await afterSettingsChange();
  return Response.json(await getSettings().view());
}

/**
 * ### DELETE
 *
 * Forgets the OAuth client file, deleting the copy Settings made.
 *
 * @returns The updated `SettingsView`.
 */
export async function DELETE(): Promise<Response> {
  await removeOAuthClient();
  await afterSettingsChange();
  return Response.json(await getSettings().view());
}
