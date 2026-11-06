import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { chooseFolder } from "@/platform/folderPicker";

const bodySchema = z.object({
  /** The folder the picker opens in; your home folder when empty. */
  start: z
    .string()
    .trim()
    .optional()
    .transform((start) => (start === "" ? undefined : start)),
});

/**
 * ### POST
 *
 * Shows the macOS folder picker and waits until you choose or cancel.
 *
 * @returns `{ folder }`: the chosen folder, or `null` when you cancel; 501 off macOS.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    return Response.json({ folder: (await chooseFolder("Choose a folder", body.start)) ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
