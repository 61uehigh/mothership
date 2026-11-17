import { errorResponse } from "@/app/api/_lib/http";
import type { GoogleOAuthSignInFailure } from "@/lib/apiErrorCodes";
import { googleSignInFailureText } from "@/shell/googleSignInFailureText";
import { translator, type Locale } from "@/ui/i18n/translate";

/**
 * ### GoogleSignInFlow
 *
 * The part of a Google sign-in (`GoogleOAuth`) the connect and callback
 * routes drive.
 */
export type GoogleSignInFlow = {
  startSignIn: (redirectUri: string) => Promise<string>;
  finishSignIn: (state: string, code: string) => Promise<GoogleOAuthSignInFailure | undefined>;
  failSignIn: (state: string | null, failure: GoogleOAuthSignInFailure) => void;
};

/**
 * ### localeFromAcceptLanguage
 *
 * The callback page opens in your system browser, which cannot read the
 * language saved in the app's storage, so it follows the browser's own
 * preference instead.
 *
 * @param header - The request's `Accept-Language`, e.g. `ko-KR,ko;q=0.9,en;q=0.8`.
 * @returns The UI language the browser prefers most, English when it names neither.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  const ranked = (header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
      return { language: tag.trim().toLowerCase().split("-")[0], weight: q === undefined ? 1 : Number(q), index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.find((entry) => entry.language === "ko" || entry.language === "en")?.language === "ko" ? "ko" : "en";
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(locale: Locale, title: string, text: string, status: number, detail?: string): Response {
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#18181b}main{max-width:28rem;padding:1.5rem}h1{font-size:1.1rem;margin:0 0 .5rem}p{margin:0;color:#52525b}p+p{margin-top:.5rem;font-size:13px;overflow-wrap:anywhere}@media (prefers-color-scheme:dark){body{background:#0c0c0e;color:#f4f4f5}p{color:#a1a1aa}}</style>
</head><body><main><h1>${escape(title)}</h1><p>${escape(text)}</p>${detail === undefined ? "" : `<p>${escape(detail)}</p>`}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * ### oauthConnect
 *
 * A connect route: sends you to Google's consent page, which sends you back
 * to the service's callback page on this server.
 *
 * @param callbackUrl - The callback page's URL for the host the request came to.
 * @returns The route handler: a redirect to Google, or `{ error, code: "unconfigured" }` without an OAuth client.
 */
export function oauthConnect(auth: () => GoogleSignInFlow, callbackUrl: (host: string) => string): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const url = await auth().startSignIn(callbackUrl(request.headers.get("host") ?? "127.0.0.1"));
      return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * ### oauthCallback
 *
 * A callback route: Google's redirect after you sign in, which trades
 * `code` for tokens when `state` is a sign-in this server started. The page
 * it answers is worded in the browser's language; Google's own words in it
 * stay as Google sent them.
 *
 * @param service - The service's name as shown, e.g. `Gmail`.
 * @param afterSuccess - Runs once the sign-in is kept, e.g. to drop a cache from before.
 * @returns The route handler: a small page saying whether it worked.
 */
export function oauthCallback(options: { service: string; auth: () => GoogleSignInFlow; afterSuccess?: () => void }): (request: Request) => Promise<Response> {
  return async (request) => {
    const locale = localeFromAcceptLanguage(request.headers.get("accept-language"));
    const t = translator(locale);
    const failed = (text: string, detail?: string) => page(locale, t("oauth.notConnected", { service: options.service }), text, 400, detail === undefined ? undefined : t("oauth.detail", { detail }));
    const refused = (failure: GoogleOAuthSignInFailure) => failed(googleSignInFailureText(t, failure.code), failure.detail);
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    const code = params.get("code");
    const denied = params.get("error");
    if (denied !== null) {
      // e.g. access_denied (you cancelled, or the client's organisation turned the account away: org_internal).
      const detail = [denied, params.get("error_subtype"), params.get("error_description")].filter(Boolean).join(": ");
      const failure: GoogleOAuthSignInFailure = { code: "denied", detail };
      options.auth().failSignIn(state, failure);
      return refused(failure);
    }
    if (state === null || code === null) return failed(t("oauth.missingCode"));
    const failure = await options.auth().finishSignIn(state, code);
    if (failure !== undefined) return refused(failure);
    options.afterSuccess?.();
    return page(locale, t("oauth.connected", { service: options.service }), t("oauth.closeTab"), 200);
  };
}
