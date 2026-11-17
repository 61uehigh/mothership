import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { openKakao } from "@/features/kakaotalk/server/kakaoDesktop";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("app") }),
  z.object({ kind: z.literal("accessibility") }),
  z.object({ kind: z.literal("automation") }),
  z.object({
    kind: z.literal("chat"),
    name: z.string().min(1).max(500),
    at: z.object({ table: z.number().int().min(0).max(50), row: z.number().int().min(0).max(500) }),
  }),
]);

/**
 * ### POST
 *
 * Brings KakaoTalk to the front. Body: `{ kind: "app" }`, `{ kind: "chat", name, at }`
 * (Mac only), or `{ kind: "accessibility" | "automation" }` (Mac only: that permission's System Settings pane).
 *
 * @returns 204; `{ error, code }` when KakaoTalk is missing or the chat moved.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    await openKakao(body);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
