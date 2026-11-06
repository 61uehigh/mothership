import { z } from "zod";
import { LINEAR_COMMENT_MAX } from "@/features/tools/model/Tools";
import { parseBody, respondWith } from "@/app/api/_lib/http";
import { forgetAfterWrite, getDashboard } from "@/composition/server";
import { commentOnLinearIssue } from "@/features/tools/linear/server/linearIssue";

const bodySchema = z.object({
  issueId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1, { error: "Write something first" }).max(LINEAR_COMMENT_MAX),
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
    await commentOnLinearIssue(caller, issueId, body, parentId);
    return { ok: true };
  }, { write: true });
  if (outcome.status === "ok") await forgetAfterWrite("linear");
  return respondWith(outcome, `a comment on ${issueId}`);
}
