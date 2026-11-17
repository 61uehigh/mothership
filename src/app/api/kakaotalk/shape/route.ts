import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { readWindowShape } from "@/features/kakaotalk/server/kakaoDesktop";

/**
 * ### GET
 *
 * @returns The `KakaoWindowShape` of the KakaoTalk window on this Mac: its
 *   structure without any text, to see why no chat list was found;
 *   `{ error, code }` when reading fails another way.
 */
export async function GET(): Promise<Response> {
  await connection();
  try {
    return Response.json(await readWindowShape());
  } catch (error) {
    return errorResponse(error);
  }
}
