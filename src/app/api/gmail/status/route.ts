import { connection } from "next/server";
import { getGmail } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The Gmail sign-in's `GmailStatus`.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getGmail().status());
}
