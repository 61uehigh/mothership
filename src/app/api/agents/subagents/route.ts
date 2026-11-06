import { connection } from "next/server";
import { getRuntime } from "@/composition/server";

/**
 * ### GET
 *
 * @returns `{ subagents }`: by session id, the sub-agents its provider ran on
 *   its own (Claude's Agent tool), for the agent graph.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ subagents: getRuntime().nativeSubagents() });
}
