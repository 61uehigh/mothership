import { getGmail } from "@/composition/server";

/**
 * ### POST
 *
 * Settings' "Test connection": reads your inbox the way the section does.
 *
 * @returns A `GmailTest`, always 200: a failure is a result to show, with the raw error.
 */
export async function POST(): Promise<Response> {
  return Response.json(await getGmail().test());
}
