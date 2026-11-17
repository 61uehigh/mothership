import { oauthCallback } from "@/app/_lib/oauthPages";
import { getGmail, getGmailAuth } from "@/composition/server";

/**
 * ### GET
 *
 * Google's redirect after you sign in to Gmail. Outside `/api/` on purpose
 * (see `loopbackCallbackUrl`). Mail cached while signed out is dropped.
 *
 * @returns A small page, in the browser's language, saying whether it worked.
 */
export const GET = oauthCallback({ service: "Gmail", auth: getGmailAuth, afterSuccess: () => getGmail().forget() });
