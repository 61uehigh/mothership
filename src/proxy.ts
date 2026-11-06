import { NextResponse, type NextRequest } from "next/server";

/** Hostnames this local app answers to; anything else is DNS rebinding or a mistake. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function forbidden(reason: string): NextResponse {
  return NextResponse.json({ error: `Blocked: ${reason}` }, { status: 403 });
}

/**
 * ### proxy
 *
 * Keeps the app reachable only from its own pages. Binding to 127.0.0.1
 * stops other machines but not other websites open in your browser, which
 * could otherwise make it send Slack messages, start agents, or read files:
 * - every request must name a local `Host` (defeats DNS rebinding);
 * - requests that change something must come from this app's own origin
 *   (`Sec-Fetch-Site`/`Origin`), not from another site.
 *
 * `/api/control` is exempt from the origin check: agents call it from local
 * processes with their own bearer token.
 */
export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(hostname)) return forbidden(`unexpected host ${host}`);

  if (request.nextUrl.pathname.startsWith("/api/control")) return NextResponse.next();

  // Browsers always send Sec-Fetch-Site; scripts on this machine (curl, the control MCP) send neither header.
  const site = request.headers.get("sec-fetch-site");
  const crossSite = site !== null && site !== "same-origin" && site !== "none";
  // Reads are refused too when another site asks for API data: a page could otherwise run
  // searches that spend Claude usage, or probe which files you have, with <img> or no-cors fetches.
  if (SAFE_METHODS.has(request.method)) {
    return crossSite && request.nextUrl.pathname.startsWith("/api/") ? forbidden(`cross-site ${request.method}`) : NextResponse.next();
  }
  if (crossSite) return forbidden(`cross-site ${request.method}`);
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return forbidden("malformed Origin");
    }
    if (originHost !== host) return forbidden(`request from ${origin}`);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except build assets, which carry no data.
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
