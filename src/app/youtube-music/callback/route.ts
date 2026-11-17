import { getYouTubeMusicAuth } from "@/composition/server";
import { errorMessage } from "@/lib/errors";

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, detail: string, status: number): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#18181b}main{max-width:28rem;padding:1.5rem}h1{font-size:1.1rem;margin:0 0 .5rem}p{margin:0;color:#52525b}@media (prefers-color-scheme:dark){body{background:#0c0c0e;color:#f4f4f5}p{color:#a1a1aa}}</style>
</head><body><main><h1>${escape(title)}</h1><p>${escape(detail)}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * ### GET
 *
 * Google's redirect after you sign in: trades `code` for tokens when `state`
 * is a sign-in this server started.
 *
 * @returns A small page saying whether it worked.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const denied = params.get("error");
  if (denied !== null) {
    // e.g. access_denied (you cancelled, or the client's organisation turned you away: org_internal).
    const detail = [denied, params.get("error_subtype"), params.get("error_description")].filter(Boolean).join(": ");
    getYouTubeMusicAuth().failSignIn(state, `Google did not finish the sign-in (${detail})`);
    return page("YouTube Music was not connected", `Google said: ${detail}. Settings → Connections shows what to do.`, 400);
  }
  if (state === null || code === null) return page("YouTube Music was not connected", "This page needs the code Google sends back. Start again from mothership.", 400);
  try {
    await getYouTubeMusicAuth().finishSignIn(state, code);
  } catch (error) {
    return page("YouTube Music was not connected", errorMessage(error), 400);
  }
  return page("YouTube Music is connected", "You can close this tab and go back to mothership.", 200);
}
