import { existsSync } from "node:fs";
import { chmod, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { OAUTH_CLIENT_MAX_BYTES, type SecretName, type SecretProblem } from "@/features/settings/model/Settings";
import { writeSecret } from "@/features/settings/server/envFile";
import { writeFileAtomic, writeQueueFor } from "@/platform/files";
import { checkDesktopClientFile } from "@/platform/google/oauthClientFile";
import { HttpError } from "@/platform/http/HttpError";
import { dataDir, dataPath } from "@/platform/paths";

/**
 * ### googleClientFile
 *
 * Where Settings keeps the Google OAuth client you choose: inside the data
 * folder, under the git-ignored `.mothership/`, readable only by you. Its
 * name marks it as a secret, so the Explorer never shows it.
 */
export function googleClientFile(): string {
  return dataPath(".mothership", "google-oauth-credentials.json");
}

/**
 * ### OAuthClientTarget
 *
 * Where a Google OAuth client file is kept and the `.env.local` variable that
 * names it: Google Calendar's by default; YouTube Music keeps its own.
 */
export type OAuthClientTarget = { file: string; variable: SecretName };

const calendarTarget = (): OAuthClientTarget => ({ file: googleClientFile(), variable: "GOOGLE_OAUTH_CREDENTIALS" });

/**
 * ### isInsideDataFolder
 *
 * @returns Whether `target` resolves to a path inside the data folder (not the folder itself).
 */
export function isInsideDataFolder(target: string, root: string = dataDir()): boolean {
  // Not traced at build time: these paths are chosen at run time (see platform/paths).
  const relative = path.relative(path.resolve(/*turbopackIgnore: true*/ root), path.resolve(/*turbopackIgnore: true*/ root, target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * ### validateOAuthClient
 *
 * Checks the size, then that the file is a Desktop app client ({@link checkDesktopClientFile}).
 *
 * @throws {@link HttpError} 400 with what is wrong and how to get the right file.
 */
export function validateOAuthClient(text: string): { projectId: string | undefined } {
  if (Buffer.byteLength(text, "utf8") > OAUTH_CLIENT_MAX_BYTES) throw new HttpError("That file is too large to be an OAuth client file.", 400, "oauth-client-too-large");
  return checkDesktopClientFile(text);
}

/**
 * ### saveOAuthClient
 *
 * Validates the uploaded client file, writes it to {@link googleClientFile}
 * (mode 600), and points `GOOGLE_OAUTH_CREDENTIALS` at it. The file is never
 * served back.
 *
 * @throws {@link HttpError} 400 for a file that is not a Desktop app OAuth client.
 */
export async function saveOAuthClient(text: string, target: OAuthClientTarget = calendarTarget()): Promise<void> {
  validateOAuthClient(text);
  const { file, variable } = target;
  await writeQueueFor(file)(async () => {
    await writeFileAtomic(file, text, { mode: 0o600 });
    // `mode` applies only to new files; an older copy keeps its own mode otherwise.
    await chmod(file, 0o600);
  });
  // With `/` on Windows too: an env file cannot hold backslashes (see writeSecret), and Node takes either.
  await writeSecret(variable, file.split(path.sep).join("/"));
}

/**
 * ### removeOAuthClient
 *
 * Clears `GOOGLE_OAUTH_CREDENTIALS`, and deletes the client file when it is
 * the copy Settings made (a file you pointed to elsewhere is left alone).
 */
export async function removeOAuthClient(target: OAuthClientTarget = calendarTarget()): Promise<void> {
  const current = process.env[target.variable] ?? "";
  await writeSecret(target.variable, "");
  if (current !== "" && path.resolve(/*turbopackIgnore: true*/ current) === target.file) await rm(target.file, { force: true });
}

/**
 * ### oauthClientProblem
 *
 * @returns What is wrong with the saved client path, or `undefined` when it is unset or fine.
 */
export function oauthClientProblem(): SecretProblem | undefined {
  const current = process.env.GOOGLE_OAUTH_CREDENTIALS ?? "";
  if (current === "") return undefined;
  return existsSync(/*turbopackIgnore: true*/ current) ? undefined : "file-missing";
}

/**
 * ### googleTokenFile
 *
 * Where the Google Calendar MCP server (`@cocal/google-calendar-mcp`) keeps
 * its sign-in: `GOOGLE_CALENDAR_MCP_TOKEN_PATH` when set, else
 * `google-calendar-mcp/tokens.json` under `XDG_CONFIG_HOME` (default `~/.config`).
 * It lies outside the data folder, so only this one file is ever touched.
 */
export function googleTokenFile(env: Partial<Record<string, string>> = process.env): string {
  return env.GOOGLE_CALENDAR_MCP_TOKEN_PATH
    ? path.resolve(/*turbopackIgnore: true*/ env.GOOGLE_CALENDAR_MCP_TOKEN_PATH)
    : path.join(/*turbopackIgnore: true*/ env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "google-calendar-mcp", "tokens.json");
}

/**
 * ### googleSignedIn
 *
 * Whether the Google Calendar MCP server has a saved sign-in on this computer. Only
 * checks that its token file exists; never reads it.
 */
export function googleSignedIn(env: Partial<Record<string, string>> = process.env): boolean {
  return existsSync(/*turbopackIgnore: true*/ googleTokenFile(env));
}

/**
 * ### removeGoogleSignIn
 *
 * Signs Google Calendar out on this computer by deleting the MCP server's token
 * file, and nothing else: the OAuth client file stays, so signing in again
 * needs no setup. Never reads the file. A file that is already gone is fine.
 *
 * @throws {@link HttpError} 409 when the path is a folder rather than a token file.
 */
export async function removeGoogleSignIn(env: Partial<Record<string, string>> = process.env): Promise<void> {
  const file = googleTokenFile(env);
  if (!existsSync(/*turbopackIgnore: true*/ file)) return;
  if (!(await stat(/*turbopackIgnore: true*/ file)).isFile()) throw new HttpError("The Google Calendar sign-in path is not a file, so it was left alone.", 409, "calendar-sign-in-not-file");
  await rm(/*turbopackIgnore: true*/ file);
}
