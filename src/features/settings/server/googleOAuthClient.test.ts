import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  googleClientFile,
  googleSignedIn,
  googleTokenFile,
  isInsideDataFolder,
  oauthClientProblem,
  removeGoogleSignIn,
  removeOAuthClient,
  saveOAuthClient,
  validateOAuthClient,
} from "@/features/settings/server/googleOAuthClient";

const DESKTOP = JSON.stringify({
  installed: { client_id: "123-abc.apps.googleusercontent.com", project_id: "my-project", client_secret: "shh", redirect_uris: ["http://localhost"] },
});

describe("validateOAuthClient", () => {
  it("accepts a Desktop app client", () => {
    expect(validateOAuthClient(DESKTOP)).toEqual({ projectId: "my-project" });
  });

  it.each([
    ["not JSON", "{oops", /not JSON/],
    ["a Web application client", JSON.stringify({ web: { client_id: "x.apps.googleusercontent.com", client_secret: "s" } }), /Web application/],
    ["a service account key", JSON.stringify({ type: "service_account", private_key: "k" }), /service account/],
    ["a file without installed", JSON.stringify({ client_id: "x" }), /Desktop app/],
    ["a bad client_id", JSON.stringify({ installed: { client_id: "nope", client_secret: "s" } }), /client_id/],
    ["a missing secret", JSON.stringify({ installed: { client_id: "x.apps.googleusercontent.com" } }), /client_secret/],
    ["a huge file", " ".repeat(70 * 1024), /too large/],
  ])("refuses %s", (_name, text, message) => {
    expect(() => validateOAuthClient(text)).toThrow(message);
  });
});

describe("isInsideDataFolder", () => {
  it("accepts paths under the folder and refuses the rest", () => {
    expect(isInsideDataFolder("/data/.mothership/a.json", "/data")).toBe(true);
    expect(isInsideDataFolder(".mothership/a.json", "/data")).toBe(true);
    expect(isInsideDataFolder("/data", "/data")).toBe(false);
    expect(isInsideDataFolder("/data/../etc/passwd", "/data")).toBe(false);
    expect(isInsideDataFolder("/Users/you/Downloads/client.json", "/data")).toBe(false);
    expect(isInsideDataFolder("/data-other/a.json", "/data")).toBe(false);
  });
});

describe("saving the client file", () => {
  let folder: string;
  const saved = { dir: process.env.MOTHERSHIP_DATA_DIR, creds: process.env.GOOGLE_OAUTH_CREDENTIALS };

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "mothership-oauth-"));
    process.env.MOTHERSHIP_DATA_DIR = folder;
    delete process.env.GOOGLE_OAUTH_CREDENTIALS;
  });

  afterEach(async () => {
    if (saved.dir === undefined) delete process.env.MOTHERSHIP_DATA_DIR;
    else process.env.MOTHERSHIP_DATA_DIR = saved.dir;
    if (saved.creds === undefined) delete process.env.GOOGLE_OAUTH_CREDENTIALS;
    else process.env.GOOGLE_OAUTH_CREDENTIALS = saved.creds;
    await rm(folder, { recursive: true, force: true });
  });

  it("copies it into the data folder, readable only by you, and points the variable at it", async () => {
    await saveOAuthClient(DESKTOP);
    const file = googleClientFile();
    expect(isInsideDataFolder(file, folder)).toBe(true);
    expect(await readFile(file, "utf8")).toBe(DESKTOP);
    // Windows has no POSIX file modes.
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    const saved = file.split(path.sep).join("/");
    expect(process.env.GOOGLE_OAUTH_CREDENTIALS).toBe(saved);
    expect(await readFile(path.join(folder, ".env.local"), "utf8")).toContain(`GOOGLE_OAUTH_CREDENTIALS="${saved}"`);
    expect(oauthClientProblem()).toBeUndefined();
  });

  it("leaves a file you pointed to elsewhere in place", async () => {
    const elsewhere = path.join(folder, "mine.json");
    await writeFile(elsewhere, DESKTOP);
    process.env.GOOGLE_OAUTH_CREDENTIALS = elsewhere;
    await removeOAuthClient();
    expect((await stat(elsewhere)).isFile()).toBe(true);
  });
});

describe("googleTokenFile", () => {
  it("follows the Calendar MCP server's own rules for where its sign-in lives", () => {
    expect(googleTokenFile({ GOOGLE_CALENDAR_MCP_TOKEN_PATH: "/tmp/x/tokens.json", XDG_CONFIG_HOME: "/cfg" })).toBe(path.resolve("/tmp/x/tokens.json"));
    expect(googleTokenFile({ XDG_CONFIG_HOME: "/cfg" })).toBe(path.join("/cfg", "google-calendar-mcp", "tokens.json"));
    expect(googleTokenFile({ HOME: "/h", XDG_CONFIG_HOME: "" }).split(path.sep).join("/")).toMatch(/\/\.config\/google-calendar-mcp\/tokens\.json$/);
  });
});

describe("removeGoogleSignIn", () => {
  let config: string;
  beforeEach(async () => {
    config = await mkdtemp(path.join(tmpdir(), "gcal-signout-"));
  });
  afterEach(async () => {
    await rm(config, { recursive: true, force: true });
  });

  it("deletes only the token file, keeping its neighbours and the folder", async () => {
    const folder = path.join(config, "google-calendar-mcp");
    await mkdir(folder);
    await writeFile(path.join(folder, "tokens.json"), "{}");
    await writeFile(path.join(folder, "other.json"), "{}");
    const env = { XDG_CONFIG_HOME: config };
    expect(googleSignedIn(env)).toBe(true);

    await removeGoogleSignIn(env);

    expect(googleSignedIn(env)).toBe(false);
    expect(await readdir(folder)).toEqual(["other.json"]);
  });

  it("is fine when there is no sign-in, and leaves a folder at the path alone", async () => {
    await expect(removeGoogleSignIn({ XDG_CONFIG_HOME: config })).resolves.toBeUndefined();
    const folder = path.join(config, "tokens.json");
    await mkdir(folder);
    await expect(removeGoogleSignIn({ GOOGLE_CALENDAR_MCP_TOKEN_PATH: folder })).rejects.toThrow(/not a file/);
    expect((await stat(folder)).isDirectory()).toBe(true);
  });
});
