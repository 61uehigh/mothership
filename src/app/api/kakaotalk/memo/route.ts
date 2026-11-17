import { z } from "zod";
import { errorResponse, parseBody } from "@/app/api/_lib/http";
import { MEMO_MAX_CHARS } from "@/features/kakaotalk/model/KakaoTalk";
import { sendMemo } from "@/features/kakaotalk/server/kakaoApi";

const bodySchema = z.object({ text: z.string().max(MEMO_MAX_CHARS * 2) });

/**
 * ### POST
 *
 * Sends a note to your own KakaoTalk chat. Body: `{ text }`.
 *
 * @returns The `SentMemo`; `{ error, code }` when you are not signed in or Kakao refuses.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    return Response.json(await sendMemo(body.text));
  } catch (error) {
    return errorResponse(error);
  }
}
