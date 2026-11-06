import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { chooseFolder } from "@/platform/desktop/desktop";

const bodySchema = z.object({
  /** The folder the picker opens in; your home folder when empty. */
  start: z
    .string()
    .trim()
    .optional()
    .transform((start) => (start === "" ? undefined : start)),
  /** The picker's title, in the UI's language; it comes from the browser because the server does not know that language. */
  prompt: z.string().trim().min(1).max(200).default("Choose a folder"),
});

/**
 * ### POST
 *
 * Shows the system's folder picker (macOS or Windows) and waits until you choose or cancel.
 *
 * @returns `{ folder }`: the chosen folder, or `null` when you cancel; 501 on other systems.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    return Response.json({ folder: (await chooseFolder(body.prompt, body.start)) ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
