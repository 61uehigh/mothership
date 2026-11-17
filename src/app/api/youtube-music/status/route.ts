import { connection } from "next/server";
import { getYouTubeMusicAuth } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The YouTube sign-in's `ConnectionStatus`.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getYouTubeMusicAuth().status());
}
