import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { getGoogleSignIn } from "@/composition/server";
import { calendarSignInCommand } from "@/features/settings/server/GoogleSignIn";

/**
 * ### GET
 *
 * @returns The `GoogleSignInState` of the sign-in Settings started.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(getGoogleSignIn().status());
}

/**
 * ### POST
 *
 * Starts the Google Calendar sign-in: Google's page opens in your browser,
 * and the sign-in is saved when you finish there. Takes no body.
 *
 * @returns The `GoogleSignInState`; 409 when no OAuth client file is set.
 */
export async function POST(): Promise<Response> {
  try {
    return Response.json(getGoogleSignIn().start(await calendarSignInCommand()));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * ### DELETE
 *
 * Stops a sign-in that is still waiting.
 *
 * @returns The `GoogleSignInState`.
 */
export function DELETE(): Response {
  return Response.json(getGoogleSignIn().cancel());
}
