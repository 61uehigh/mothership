import { connection } from "next/server";
import { getSystemMonitor } from "@/composition/server";

/**
 * ### GET
 *
 * @returns This computer's `SystemSnapshot`.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getSystemMonitor().snapshot());
}
