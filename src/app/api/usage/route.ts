import { connection } from "next/server";
import { errorResponse } from "@/app/api/_lib/http";
import { getUsageTracker } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The latest `UsageSnapshot`.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getUsageTracker().snapshot());
}

/**
 * ### POST
 *
 * Reads Claude's limits now, the way Claude Code's `/usage` does (no
 * model call, no tokens used), then returns the snapshot.
 *
 * @returns The updated `UsageSnapshot`, or `{ error, code? }` saying why
 *   Claude refused the check (expired login 401, no plan limits 409,
 *   timeout 504, anything else 502).
 */
export async function POST(): Promise<Response> {
  const tracker = getUsageTracker();
  try {
    await tracker.probeClaude();
  } catch (error) {
    return errorResponse(error, 502);
  }
  return Response.json(await tracker.snapshot());
}
