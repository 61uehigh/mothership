import { HttpError } from "@/platform/http/HttpError";
import { completeSignIn } from "@/features/kakaotalk/server/kakaoApi";

/** A plain page for the browser tab Kakao sends back to; mothership itself picks up the new state. */
function page(title: string, detail: string, status: number): Response {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><meta charset="utf-8"><title>${escape(title)}</title><body style="font:14px system-ui;margin:3rem;max-width:32rem"><h1 style="font-size:18px">${escape(title)}</h1><p>${escape(detail)}</p></body>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * ### GET
 *
 * Where Kakao sends you back after you agree: trades the code for tokens.
 * Query: `code` and `state`, or `error` and `error_description` when you declined.
 *
 * @returns A short page saying whether signing in worked.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (code === null || state === null) {
    return page("Kakao sign-in didn't finish", params.get("error_description") ?? params.get("error") ?? "Kakao sent no code.", 400);
  }
  try {
    await completeSignIn(code, state);
    return page("Connected to Kakao", "You can close this tab and send notes to yourself from mothership's KakaoTalk section.", 200);
  } catch (error) {
    if (error instanceof HttpError) return page("Kakao sign-in failed", error.message, error.status);
    throw error;
  }
}
