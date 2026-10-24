import { z } from "zod";
import { errorResponse, parseQuery } from "@/app/api/_lib/http";
import { getFiles } from "@/composition/server";

const querySchema = z.object({ root: z.string().min(1), path: z.string().min(1) });

/**
 * ### GET
 *
 * A file as it is, for the viewer: images, PDFs, audio, video, and text or
 * Markdown. `?root=` and `?path=` as for `/api/files/content`. SVGs are
 * served sandboxed, since they can carry scripts.
 *
 * @returns The file's bytes; 400, 403, 404, 413, or 415 as `{ error }`.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  try {
    const file = await getFiles().readRawFile(query.root, query.path);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(file.contentType === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
