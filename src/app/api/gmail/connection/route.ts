import { getGmail, getGmailAuth } from "@/composition/server";

/**
 * ### DELETE
 *
 * Signs out of Gmail: forgets the saved sign-in and asks Google to revoke
 * it. Google Calendar's sign-in and OAuth client are not touched.
 *
 * @returns 204.
 */
export async function DELETE(): Promise<Response> {
  await getGmailAuth().disconnect();
  getGmail().forget();
  return new Response(null, { status: 204 });
}
