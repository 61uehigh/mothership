import { errorResponse } from "@/app/api/_lib/http";
import { openConfigFolder } from "@/features/settings/server/configFolder";

/**
 * ### POST
 *
 * Opens your config folder in Finder.
 *
 * @returns `{ folder }`, the path that was opened; 501 off macOS.
 */
export async function POST(): Promise<Response> {
  try {
    return Response.json({ folder: await openConfigFolder() });
  } catch (error) {
    return errorResponse(error);
  }
}
