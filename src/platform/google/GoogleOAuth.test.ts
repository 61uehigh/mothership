import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codeChallenge, GoogleOAuth, googleAuthorizeUrl } from "@/platform/google/GoogleOAuth";
import { HttpError } from "@/platform/http/HttpError";

const client = { clientId: "client-1", clientSecret: "secret", projectId: "project" };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function tokenResponse(accessToken: string, refreshToken?: string): Response {
  return Response.json({ access_token: accessToken, expires_in: 3600, ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }) });
}

/**
 * Answers token requests with `token` (once it resolves) and revokes at once.
 *
 * @returns Resolves once a token request has been sent.
 */
function stubFetch(token: Promise<Response>): Promise<void> {
  const asked = deferred<void>();
  vi.stubGlobal("fetch", (url: string) => {
    if (url.includes("/revoke")) return Promise.resolve(new Response(null));
    asked.resolve();
    return token;
  });
  return asked.promise;
}

async function setUp(saved?: object): Promise<{ auth: GoogleOAuth; file: string }> {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "google-oauth-")), "token.json");
  if (saved !== undefined) await writeFile(file, JSON.stringify(saved));
  const auth = new GoogleOAuth({
    file,
    scope: "openid",
    service: "Test",
    readClient: async () => ({ client }),
    fail: (message, status, code) => new HttpError(message, status, code),
  });
  return { auth, file };
}

async function exists(file: string): Promise<boolean> {
  return readFile(file, "utf8").then(
    () => true,
    () => false,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GoogleOAuth", () => {
  it("keeps a refreshed token when nothing changed meanwhile", async () => {
    const { auth, file } = await setUp({ refreshToken: "refresh-1", expiresAt: 0, clientId: client.clientId, account: "me" });
    void stubFetch(Promise.resolve(tokenResponse("access-2")));
    expect(await auth.accessToken()).toBe("access-2");
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ refreshToken: "refresh-1", accessToken: "access-2", account: "me" });
  });

  it("does not write the token file back when you disconnect while Google answers a refresh", async () => {
    const { auth, file } = await setUp({ refreshToken: "refresh-1", expiresAt: 0, clientId: client.clientId });
    const token = deferred<Response>();
    const asked = stubFetch(token.promise);
    const access = auth.accessToken();
    await asked;
    await auth.disconnect();
    token.resolve(tokenResponse("access-2", "refresh-2"));
    expect(await access).toBe("access-2");
    expect(await exists(file)).toBe(false);
    expect((await auth.status()).state).toBe("disconnected");
  });

  it("does not overwrite a newer sign-in with a refresh of the old one", async () => {
    const { auth, file } = await setUp({ refreshToken: "refresh-1", expiresAt: 0, clientId: client.clientId });
    const token = deferred<Response>();
    const asked = stubFetch(token.promise);
    const access = auth.accessToken();
    await asked;
    await writeFile(file, JSON.stringify({ refreshToken: "refresh-new", clientId: client.clientId }));
    token.resolve(tokenResponse("access-2"));
    await access;
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ refreshToken: "refresh-new", clientId: client.clientId });
  });

  it("keeps nothing from a sign-in that finishes after you disconnect", async () => {
    const { auth, file } = await setUp();
    const consent = new URL(await auth.startSignIn("http://127.0.0.1:3000/callback"));
    const state = consent.searchParams.get("state") ?? "";
    const token = deferred<Response>();
    const asked = stubFetch(token.promise);
    const finishing = auth.finishSignIn(state, "code");
    await asked;
    await auth.disconnect();
    token.resolve(tokenResponse("access-1", "refresh-1"));
    expect(await finishing).toEqual({ code: "disconnected-meanwhile" });
    expect(await exists(file)).toBe(false);
  });

  it("counts every sign-in that ends, so a card waiting on a new one is not ended by the old one", async () => {
    const { auth } = await setUp({ refreshToken: "refresh-old", clientId: client.clientId });
    const signIn = async () => new URL(await auth.startSignIn("http://127.0.0.1:3000/callback")).searchParams.get("state") ?? "";
    expect(await auth.status()).toMatchObject({ state: "connected", signInsEnded: 0 });

    const finished = await signIn();
    expect((await auth.status()).signInsEnded).toBe(0);
    void stubFetch(Promise.resolve(tokenResponse("access-1", "refresh-1")));
    expect(await auth.finishSignIn(finished, "code")).toBeUndefined();
    expect(await auth.status()).toMatchObject({ state: "connected", signInsEnded: 1, signInError: undefined });

    auth.failSignIn(await signIn(), { code: "denied", detail: "access_denied" });
    expect(await auth.status()).toMatchObject({ signInsEnded: 2, signInError: { code: "denied", detail: "access_denied" } });

    const noRefreshToken = await signIn();
    void stubFetch(Promise.resolve(tokenResponse("access-2")));
    expect(await auth.finishSignIn(noRefreshToken, "code")).toEqual({ code: "no-refresh-token" });
    expect(await auth.status()).toMatchObject({ signInsEnded: 3, signInError: { code: "no-refresh-token" } });
  });

  it("ends a sign-in that comes back after ten minutes, saying why", async () => {
    const { auth } = await setUp({ refreshToken: "refresh-old", clientId: client.clientId });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const state = new URL(await auth.startSignIn("http://127.0.0.1:3000/callback")).searchParams.get("state") ?? "";
      vi.setSystemTime(Date.now() + 11 * 60_000);
      expect(await auth.finishSignIn(state, "code")).toEqual({ code: "sign-in-timed-out" });
      expect(await auth.status()).toMatchObject({ signInsEnded: 1, signInError: { code: "sign-in-timed-out" } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not end a waiting sign-in for one this server never started", async () => {
    const { auth } = await setUp({ refreshToken: "refresh-old", clientId: client.clientId });
    expect(await auth.finishSignIn("unknown-state", "code")).toEqual({ code: "sign-in-unknown" });
    expect(await auth.status()).toMatchObject({ signInsEnded: 0, signInError: undefined });
  });
});

describe("googleAuthorizeUrl", () => {
  it("asks for the scope with PKCE and a refresh token, never sending the client secret", () => {
    const url = new URL(googleAuthorizeUrl("https://www.googleapis.com/auth/youtube.readonly openid email", client, "http://127.0.0.1:3000/youtube-music/callback", "st", "verifier"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.readonly openid email");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("select_account consent");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge("verifier"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
});

describe("codeChallenge", () => {
  it("uses the RFC 7636 S256 challenge", () => {
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
