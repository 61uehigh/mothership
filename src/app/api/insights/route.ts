import { connection } from "next/server";
import { z } from "zod";
import { parseBody, parseQuery } from "@/app/api/_lib/http";
import { getUsageLog } from "@/composition/server";
import { usageBatchSchema } from "@/features/insights/model/Usage";

const querySchema = z.object({
  /** The first local day to count, `YYYY-MM-DD`. */
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * ### GET
 *
 * @returns `UsageStats` from `?since=` on: active time and each feature's uses by entry path.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const query = parseQuery(request, querySchema);
  if (query instanceof Response) return query;
  return Response.json(getUsageLog().stats(query.since));
}

/**
 * ### POST
 *
 * Records a batch of uses and active time from the browser (see `UsageBatch`).
 *
 * @returns 204, or 400 for an invalid batch.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, usageBatchSchema);
  if (body instanceof Response) return body;
  getUsageLog().record(body);
  return new Response(null, { status: 204 });
}
