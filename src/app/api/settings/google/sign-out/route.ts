import { errorResponse } from "@/app/api/_lib/http";
import { afterGoogleSignOut, getSettings } from "@/composition/server";
import { removeGoogleSignIn } from "@/features/settings/server/googleOAuthClient";

/**
 * ### POST
 *
 * Signs Google Calendar out on this Mac: deletes the Calendar MCP server's
 * saved sign-in (its token file only; the OAuth client file stays) and
 * closes the server so nothing keeps using the old token. Takes no body.
 *
 * @returns The updated `SettingsView`; 409 when the sign-in path is not a file.
 */
export async function POST(): Promise<Response> {
  try {
    await removeGoogleSignIn();
  } catch (error) {
    return errorResponse(error);
  }
  await afterGoogleSignOut();
  return Response.json(await getSettings().view());
}
