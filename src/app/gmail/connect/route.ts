import { oauthConnect } from "@/app/_lib/oauthPages";
import { getGmailAuth } from "@/composition/server";
import { gmailCallbackUrl } from "@/features/gmail/server/GmailAuth";

/**
 * ### GET
 *
 * Starts signing in to Gmail (with Google Calendar's OAuth client): sends you
 * to Google's consent page, which sends you back to `/gmail/callback`. The
 * desktop app opens this in your browser, where you are already signed in
 * to Google.
 *
 * @returns A redirect to Google, or `{ error, code: "unconfigured" }` without Google Calendar's OAuth client.
 */
export const GET = oauthConnect(getGmailAuth, gmailCallbackUrl);
