import { errorResponse } from "@/app/api/_lib/http";
import { authorizeUrl, signOut } from "@/features/kakaotalk/server/kakaoApi";

/**
 * ### callbackUrl
 *
 * This server's Kakao callback, as registered in the Kakao app's Redirect URIs.
 */
function callbackUrl(request: Request): string {
  return `${new URL(request.url).origin}/api/kakaotalk/auth/callback`;
}

/**
 * ### GET
 *
 * Starts signing in with Kakao: redirects to Kakao's consent page.
 *
 * @returns A redirect; `{ error, code }` when the REST API key is not set.
 */
export function GET(request: Request): Response {
  try {
    return Response.redirect(authorizeUrl(callbackUrl(request)), 302);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * ### DELETE
 *
 * Forgets your Kakao sign-in.
 *
 * @returns 204.
 */
export async function DELETE(): Promise<Response> {
  await signOut();
  return new Response(null, { status: 204 });
}
