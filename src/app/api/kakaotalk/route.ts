import { connection } from "next/server";
import { kakaoStatus } from "@/features/kakaotalk/server/kakaoApi";

/**
 * ### GET
 *
 * @returns The `KakaoStatus`: the server's platform, whether Kakao is set up and signed in, and your recent notes.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await kakaoStatus());
}
