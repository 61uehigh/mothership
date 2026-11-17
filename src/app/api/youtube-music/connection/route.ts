import { getYouTubeMusicAuth } from "@/composition/server";

/**
 * ### DELETE
 *
 * Signs out of YouTube: forgets the saved sign-in and asks Google to revoke it.
 *
 * @returns 204.
 */
export async function DELETE(): Promise<Response> {
  await getYouTubeMusicAuth().disconnect();
  return new Response(null, { status: 204 });
}
