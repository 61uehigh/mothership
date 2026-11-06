import { z } from "zod";
import { HttpError } from "@/platform/http/HttpError";

/**
 * ### OAuthClient
 *
 * The id and secret of a Google OAuth client. A "Desktop app" client's
 * secret is not secret in Google's sense, but it is still never shown.
 */
export type OAuthClient = { clientId: string; clientSecret: string; projectId?: string };

const clientSchema = z.object({ client_id: z.string().min(1), client_secret: z.string().min(1), project_id: z.string().optional() });
const clientFileSchema = z.union([z.object({ installed: clientSchema }), z.object({ web: clientSchema })]);
const fieldsSchema = z.record(z.string(), z.unknown());

/**
 * ### parseOAuthClientFile
 *
 * Reads a saved client file. Lenient on purpose: a "Web application" client
 * someone pointed to by hand is read too; {@link checkDesktopClientFile}
 * decides what Settings accepts.
 *
 * @returns The client, or `undefined` when the JSON is not a client file.
 */
export function parseOAuthClientFile(json: unknown): OAuthClient | undefined {
  const parsed = clientFileSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const client = "installed" in parsed.data ? parsed.data.installed : parsed.data.web;
  return { clientId: client.client_id, clientSecret: client.client_secret, ...(client.project_id === undefined ? {} : { projectId: client.project_id }) };
}

/**
 * ### checkDesktopClientFile
 *
 * Checks that `text` is the JSON Google Cloud downloads for a *Desktop app*
 * OAuth client, `{ "installed": { client_id, client_secret, ... } }`, and
 * says what is wrong otherwise: a service account key and a Web application
 * client are the usual mix-ups.
 *
 * @returns The client's project id, when the file names one.
 * @throws {@link HttpError} 400 with what is wrong and how to get the right file.
 */
export function checkDesktopClientFile(text: string): { projectId: string | undefined } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new HttpError("That file is not JSON. Download the OAuth client's JSON from Google Cloud → Credentials.", 400, "oauth-client-not-json");
  }
  const file = fieldsSchema.safeParse(json);
  if (!file.success) throw new HttpError("That file is not an OAuth client file.", 400, "oauth-client-not-client-file");
  if (file.data.type === "service_account") throw new HttpError("That is a service account key. Create an OAuth client of type Desktop app instead.", 400, "oauth-client-service-account");
  if ("web" in file.data) throw new HttpError("That is a Web application client. Create an OAuth client of type Desktop app instead.", 400, "oauth-client-web-app");
  const installed = fieldsSchema.safeParse(file.data.installed);
  if (!installed.success) throw new HttpError('That file is not a Desktop app OAuth client (it has no "installed" section).', 400, "oauth-client-not-desktop");
  const { client_id: clientId, client_secret: secret, project_id: projectId } = installed.data;
  if (typeof clientId !== "string" || !clientId.endsWith(".apps.googleusercontent.com")) {
    throw new HttpError("The file has no valid client_id. Download it again from Google Cloud → Credentials.", 400, "oauth-client-no-id");
  }
  if (typeof secret !== "string" || secret === "") throw new HttpError("The file has no client_secret. Download it again from Google Cloud → Credentials.", 400, "oauth-client-no-secret");
  return { projectId: typeof projectId === "string" ? projectId : undefined };
}
