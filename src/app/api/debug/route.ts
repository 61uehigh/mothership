import { connection } from "next/server";
import { debugInfo } from "@/composition/server";

/**
 * ### GET
 *
 * @returns `DebugInfo`: how this server runs, the source checkout's state, and the end of the server log.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await debugInfo());
}
