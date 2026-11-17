import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getYouTubeMusicAuth } from "@/composition/server";
import { OAUTH_CLIENT_MAX_BYTES } from "@/features/settings/model/Settings";
import { removeOAuthClient, saveOAuthClient, type OAuthClientTarget } from "@/features/settings/server/googleOAuthClient";
import { CREDENTIALS_VARIABLE } from "@/features/youtube-music/server/YouTubeMusicAuth";
import { dataPath } from "@/platform/paths";

const bodySchema = z.object({
  /** The text of the OAuth client JSON you chose or dropped. */
  content: z.string().min(1).max(OAUTH_CLIENT_MAX_BYTES),
});

/** YouTube Music's own client file, apart from Google Calendar's; its name marks it as a secret to the Explorer. */
const target = (): OAuthClientTarget => ({ file: dataPath(".mothership", "youtube-oauth-credentials.json"), variable: CREDENTIALS_VARIABLE });

/**
 * ### PUT
 *
 * Saves YouTube Music's own Google OAuth client file (a Desktop app client)
 * into the data folder (mode 600) and points `YOUTUBE_OAUTH_CREDENTIALS` at
 * it. Body: `{ content }`. The file is never sent back. A sign-in made with
 * an earlier client is dropped.
 *
 * @returns The new `ConnectionStatus`; 400 when it is not a Desktop app OAuth client.
 */
export async function PUT(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await saveOAuthClient(body.content, target());
  } catch (error) {
    return errorResponse(error);
  }
  const auth = getYouTubeMusicAuth();
  await auth.disconnect();
  return Response.json(await auth.status());
}

/**
 * ### DELETE
 *
 * Forgets YouTube Music's client file (deleting the copy Settings made) and
 * its sign-in. Google Calendar's client is not touched.
 *
 * @returns The new `ConnectionStatus`.
 */
export async function DELETE(): Promise<Response> {
  const auth = getYouTubeMusicAuth();
  await auth.disconnect();
  await removeOAuthClient(target());
  return Response.json(await auth.status());
}
