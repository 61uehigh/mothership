import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readClient, YouTubeMusicAuth } from "@/features/youtube-music/server/YouTubeMusicAuth";
import { codeChallenge } from "@/platform/google/GoogleOAuth";

const CLIENT = { clientId: "id.apps.googleusercontent.com", clientSecret: "shh" };
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ytm-auth-"));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("readClient", () => {
  it("reads only YouTube Music's own client file, never Google Calendar's", async () => {
    const own = path.join(dir, "own.json");
    const calendar = path.join(dir, "calendar.json");
    await writeFile(own, JSON.stringify({ installed: { client_id: "own", client_secret: "s", project_id: "music" } }));
    await writeFile(calendar, JSON.stringify({ installed: { client_id: "work", client_secret: "s" } }));
    expect(await readClient({ YOUTUBE_OAUTH_CREDENTIALS: own, GOOGLE_OAUTH_CREDENTIALS: calendar })).toEqual({ client: { clientId: "own", clientSecret: "s", projectId: "music" } });
    expect(await readClient({ GOOGLE_OAUTH_CREDENTIALS: calendar })).toEqual({ reason: "client-missing", saved: false });
    expect(await readClient({ YOUTUBE_MUSIC_OAUTH_CREDENTIALS: own })).toMatchObject({ saved: false });
  });
});

function tokenAnswers(...bodies: Array<{ status: number; body: unknown }>) {
  const fetch = vi.fn(async () => {
    const next = bodies.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("YouTubeMusicAuth", () => {
  const auth = (whoAmI?: (token: string) => Promise<string | undefined>) =>
    new YouTubeMusicAuth(path.join(dir, "token.json"), async () => ({ client: { ...CLIENT, projectId: "proj" } }), whoAmI);

  it("signs in, keeps the refresh token private, and reuses a live access token", async () => {
    const a = auth(async (token) => (token === "at1" ? "My channel" : undefined));
    const url = new URL(await a.startSignIn("http://127.0.0.1:3000/youtube-music/callback"));
    const idToken = `h.${Buffer.from(JSON.stringify({ email: "me@example.com" })).toString("base64url")}.s`;
    const fetch = tokenAnswers({ status: 200, body: { access_token: "at1", expires_in: 3600, refresh_token: "rt", id_token: idToken } });
    await a.finishSignIn(url.searchParams.get("state") ?? "", "code");
    const form = new URLSearchParams(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(codeChallenge(form.get("code_verifier") ?? "")).toBe(url.searchParams.get("code_challenge"));
    expect(await a.status()).toMatchObject({ state: "connected", account: "My channel", email: "me@example.com" });
    expect(await a.accessToken()).toBe("at1");
    expect(fetch).toHaveBeenCalledTimes(1);
    // Windows has no POSIX file modes.
    if (process.platform !== "win32") expect((await stat(path.join(dir, "token.json"))).mode & 0o777).toBe(0o600);
    // A state works once.
    expect(await a.finishSignIn(url.searchParams.get("state") ?? "", "code")).toEqual({ code: "sign-in-unknown" });
  });

  it("refreshes an expired access token once for concurrent callers", async () => {
    await writeFile(path.join(dir, "token.json"), JSON.stringify({ refreshToken: "rt", accessToken: "old", expiresAt: Date.now() - 1, clientId: CLIENT.clientId }));
    const fetch = tokenAnswers({ status: 200, body: { access_token: "fresh", expires_in: 3600 } });
    const a = auth();
    expect(await Promise.all([a.accessToken(), a.accessToken()])).toEqual(["fresh", "fresh"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(path.join(dir, "token.json"), "utf8"))).toMatchObject({ refreshToken: "rt", accessToken: "fresh" });
  });

  it("reports a refresh token Google no longer accepts as expired", async () => {
    await writeFile(path.join(dir, "token.json"), JSON.stringify({ refreshToken: "rt", clientId: CLIENT.clientId }));
    tokenAnswers({ status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } });
    const a = auth();
    await expect(a.accessToken()).rejects.toMatchObject({ code: "expired" });
    expect(await a.status()).toMatchObject({ state: "expired" });
  });

  it("forgets the sign-in on disconnect even when Google cannot be reached", async () => {
    await writeFile(path.join(dir, "token.json"), JSON.stringify({ refreshToken: "rt", clientId: CLIENT.clientId }));
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const a = auth();
    await a.disconnect();
    expect(await a.status()).toMatchObject({ state: "disconnected" });
  });

  it("does not count a sign-in made with another client, such as Google Calendar's", async () => {
    await writeFile(path.join(dir, "token.json"), JSON.stringify({ refreshToken: "rt", accessToken: "at", expiresAt: Date.now() + 3_600_000 }));
    expect(await auth().status()).toMatchObject({ state: "disconnected" });
    await expect(auth().accessToken()).rejects.toMatchObject({ code: "disconnected" });
    await writeFile(path.join(dir, "token.json"), JSON.stringify({ refreshToken: "rt", clientId: "work-client" }));
    expect(await auth().status()).toMatchObject({ state: "disconnected" });
  });

  it("remembers why a sign-in it started came back refused, until the next one", async () => {
    const a = auth();
    const state = new URL(await a.startSignIn("http://127.0.0.1:3000/youtube-music/callback")).searchParams.get("state");
    a.failSignIn("made-up", { code: "denied" });
    expect(await a.status()).toMatchObject({ signInError: undefined });
    a.failSignIn(state, { code: "denied", detail: "access_denied: org_internal" });
    expect(await a.status()).toMatchObject({ signInError: { code: "denied", detail: "access_denied: org_internal" } });
    await a.startSignIn("http://127.0.0.1:3000/youtube-music/callback");
    expect(await a.status()).toMatchObject({ signInError: undefined });
  });

  it("finishes a sign-in even when reading the channel fails", async () => {
    const a = auth(async () => Promise.reject(new Error("API disabled")));
    const url = new URL(await a.startSignIn("http://127.0.0.1:3000/youtube-music/callback"));
    tokenAnswers({ status: 200, body: { access_token: "at", expires_in: 3600, refresh_token: "rt" } });
    await a.finishSignIn(url.searchParams.get("state") ?? "", "code");
    expect(await a.status()).toMatchObject({ state: "connected", account: undefined });
  });
});
