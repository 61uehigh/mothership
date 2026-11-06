import { describe, expect, it } from "vitest";
import { GoogleSignIn, lastUsefulLine, signInSpawnPlan } from "@/features/settings/server/GoogleSignIn";
import type { GoogleSignInState } from "@/features/settings/model/Settings";

async function until(signIn: GoogleSignIn, done: (state: GoogleSignInState) => boolean): Promise<GoogleSignInState> {
  for (let i = 0; i < 100; i++) {
    const state = signIn.status();
    if (done(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Still ${signIn.status().state}`);
}

const fake = (script: string) => ({ command: process.execPath, args: ["-e", script, "--"], env: { GOOGLE_OAUTH_CREDENTIALS: "/x.json" } });

describe("GoogleSignIn", () => {
  it("offers the sign-in page while waiting, then finishes", async () => {
    const signIn = new GoogleSignIn();
    signIn.start(fake("console.error('Authentication URL: https://accounts.google.com/o/oauth2/v2/auth?x=1'); setTimeout(() => process.exit(0), 300)"));
    const waiting = await until(signIn, (s) => s.state === "waiting" && s.url !== undefined);
    expect(waiting).toMatchObject({ url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    expect(await until(signIn, (s) => s.state !== "waiting")).toMatchObject({ state: "done" });
  });

  it("reports the last line when it fails", async () => {
    const signIn = new GoogleSignIn();
    signIn.start(fake("console.error('Could not start auth server on available port.'); process.exit(1)"));
    expect(await until(signIn, (s) => s.state !== "waiting")).toMatchObject({ state: "failed", code: "sign-in-stopped", output: "Could not start auth server on available port." });
  });
});

describe("lastUsefulLine", () => {
  it("skips blank lines, npm notices, and the URL line", () => {
    expect(lastUsefulLine("Failed: bad\nnpm notice x\nAuthentication URL: https://accounts.google.com/a\n\n")).toBe("Failed: bad");
  });
});

describe("signInSpawnPlan", () => {
  it("runs the command directly outside Windows", () => {
    expect(signInSpawnPlan("npx", ["-y", "@cocal/google-calendar-mcp@2.7.0", "auth"], "darwin")).toEqual({ file: "npx", args: ["-y", "@cocal/google-calendar-mcp@2.7.0", "auth"], verbatim: false });
  });

  it("goes through cmd.exe on Windows so npm's .cmd shims start, quoting what needs it", () => {
    expect(signInSpawnPlan("npx", ["-y", "@cocal/google-calendar-mcp@2.7.0", "auth"], "win32")).toEqual({ file: "cmd.exe", args: ["/d", "/s", "/c", '"npx -y @cocal/google-calendar-mcp@2.7.0 auth"'], verbatim: true });
    expect(signInSpawnPlan("C:\\Program Files\\nodejs\\npx.cmd", ['say "hi"'], "win32").args[3]).toBe('""C:\\Program Files\\nodejs\\npx.cmd" "say ""hi""""');
  });
});
