import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { getFiles } from "@/composition/server";

const bodySchema = z.object({
  root: z.string().min(1),
  path: z.string().default(""),
  app: z.enum(["finder", "terminal", "vscode"]),
});

/**
 * ### POST
 *
 * Opens a folder or file under the root in Finder, Terminal, or VS Code on
 * this Mac. Body: `{ root, path, app }`.
 *
 * @returns 204; 400 for invalid input or a path outside the root, 403 for a
 *   secret path, 404 for a missing path, 501 off macOS.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await getFiles().openPath(body.root, body.path, body.app);
    return new Response(undefined, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
