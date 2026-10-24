import { z } from "zod";
import { parseBody, respondWith } from "@/app/api/_lib/http";
import { getDashboard } from "@/composition/server";

const bodySchema = z.object({
  issueId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1, { error: "Write something first" }).max(20_000),
  /** Reply in this comment's thread instead of starting a new one. */
  parentId: z.string().trim().min(1).max(100).optional(),
});

/**
 * ### POST
 *
 * Adds a comment to a Linear issue, or a reply when `parentId` is given,
 * through the `linear` widget's source. Body: `{ issueId, body, parentId? }`.
 *
 * @returns `{ ok: true }`; 400 for invalid input, 409 when Linear is not set up, 502 when the call fails.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await parseBody(request, bodySchema);
  if (input instanceof Response) return input;
  const { issueId, body, parentId } = input;
  const outcome = await getDashboard().callTool("linear", async (caller) => {
    await caller.callText("save_comment", parentId === undefined ? { issueId, body } : { parentId, body });
    return { ok: true };
  }, { write: true });
  return respondWith(outcome, `a comment on ${issueId}`);
}
