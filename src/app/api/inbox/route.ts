import { connection } from "next/server";
import { z } from "zod";
import { parseQuery } from "@/app/api/_lib/http";
import { loadInbox } from "@/composition/server";

const querySchema = z.object({ refresh: z.enum(["1"]).optional() });

/**
 * ### GET
 *
 * @returns `InboxView`: what needs you from agents, GitHub, Slack, and Linear, sorted
 *   by your rules and today's Claude review. `?refresh=1` loads every source fresh.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json(await loadInbox(query.refresh === "1"));
}
