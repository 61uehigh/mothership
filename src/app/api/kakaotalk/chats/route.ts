import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { readChats } from "@/features/kakaotalk/server/kakaoDesktop";

/**
 * ### GET
 *
 * @returns The `KakaoChats` the KakaoTalk app on this Mac shows, or why they
 *   could not be read; `{ error, code }` when reading fails another way.
 */
export async function GET(): Promise<Response> {
  await connection();
  try {
    return Response.json(await readChats());
  } catch (error) {
    return errorResponse(error);
  }
}
