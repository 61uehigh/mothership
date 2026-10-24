import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { addLinearReaction, removeLinearReaction } from "@/features/tools/linear/server/linearApi";

const EMOJI = z.string().regex(/^[a-z0-9_+-]{1,64}$/, { error: "emoji must be a shortcode name such as +1" });

const bodySchema = z.union([
  z.object({ action: z.literal("add"), commentId: z.string().min(1).max(100), emoji: EMOJI }),
  z.object({ action: z.literal("add"), issueId: z.string().min(1).max(100), emoji: EMOJI }),
  z.object({ action: z.literal("remove"), reactionId: z.string().min(1).max(100) }),
]);

/**
 * ### POST
 *
 * Adds an emoji reaction to a Linear comment or issue, or removes one of
 * yours. Goes to Linear's GraphQL API with `LINEAR_API_KEY`, since the Linear
 * MCP server has no reaction tools. Body: `{ action: "add", commentId | issueId, emoji }`
 * or `{ action: "remove", reactionId }`.
 *
 * @returns `{ ok: true }`; 400 for invalid input, 409 without an API key, 502 when Linear fails.
 */
export async function POST(request: Request): Promise<Response> {
  const input = await parseBody(request, bodySchema);
  if (input instanceof Response) return input;
  try {
    if (input.action === "remove") await removeLinearReaction(input.reactionId);
    else await addLinearReaction("commentId" in input ? { commentId: input.commentId } : { issueId: input.issueId }, input.emoji);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
