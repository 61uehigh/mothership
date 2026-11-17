import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GMAIL_SCOPE, GmailAuth, gmailCallbackUrl, readCalendarClient } from "@/features/gmail/server/GmailAuth";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "gmail-auth-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("GmailAuth", () => {
  it("signs in with Google Calendar's OAuth client, never YouTube Music's", async () => {
    const calendar = path.join(dir, "calendar.json");
    await writeFile(calendar, JSON.stringify({ installed: { client_id: "work", client_secret: "s", project_id: "work-project" } }));
    expect(await readCalendarClient({ GOOGLE_OAUTH_CREDENTIALS: calendar, YOUTUBE_OAUTH_CREDENTIALS: "/elsewhere.json" })).toEqual({ client: { clientId: "work", clientSecret: "s", projectId: "work-project" } });
    expect(await readCalendarClient({ YOUTUBE_OAUTH_CREDENTIALS: calendar })).toEqual({ saved: false, reason: "client-missing" });
  });

  it("asks only for read-only Gmail access and comes back to its own callback", async () => {
    const auth = new GmailAuth(path.join(dir, "token.json"), async () => ({ client: { clientId: "work", clientSecret: "s" } }));
    const url = new URL(await auth.startSignIn(gmailCallbackUrl("localhost:3000")));
    expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPE);
    expect(GMAIL_SCOPE).toContain("gmail.readonly");
    expect(GMAIL_SCOPE).not.toMatch(/gmail\.(modify|send|compose)|mail\.google\.com/);
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/gmail/callback");
    await expect(auth.accessToken()).rejects.toMatchObject({ code: "disconnected", message: "Sign in to Gmail first" });
  });
});
