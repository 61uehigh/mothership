import { connection } from "next/server";
import { getRuntime } from "@/composition/server";

/**
 * ### GET
 *
 * The sessions working right now. `pnpm app:install` asks the running app
 * this before replacing it, and the desktop app before it quits, so neither
 * stops agents mid-turn without saying so. Local requests only (the request
 * guard refuses other hosts and other websites).
 *
 * @returns `{ running }`: each running session's id, name, and its lead's name for a sub-agent.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ running: getRuntime().runningTurns() });
}
