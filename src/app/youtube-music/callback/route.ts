import { oauthCallback } from "@/app/_lib/oauthPages";
import { getYouTubeMusicAuth } from "@/composition/server";

/**
 * ### GET
 *
 * Google's redirect after you sign in to YouTube. Outside `/api/` on
 * purpose (see `loopbackCallbackUrl`).
 *
 * @returns A small page, in the browser's language, saying whether it worked.
 */
export const GET = oauthCallback({ service: "YouTube Music", auth: getYouTubeMusicAuth });
