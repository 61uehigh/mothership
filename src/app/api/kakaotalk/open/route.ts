import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { kakaoOpenTargetSchema } from "@/features/kakaotalk/model/KakaoTalk";
import { openKakao } from "@/features/kakaotalk/server/kakaoDesktop";

/**
 * ### POST
 *
 * Brings KakaoTalk to the front. Body: `{ kind: "app" }`, `{ kind: "chat", name, at }`
 * (Mac only), or `{ kind: "accessibility" | "automation" }` (Mac only: that permission's System Settings pane).
 *
 * @returns 204; `{ error, code }` (a `KakaoErrorCode`) when KakaoTalk is missing, the chat moved, or the script failed.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, kakaoOpenTargetSchema);
  if (body instanceof Response) return body;
  try {
    await openKakao(body);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
