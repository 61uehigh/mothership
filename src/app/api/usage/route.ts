import { connection } from "next/server";
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
 * Refreshes Claude limits with one tiny Haiku call (about $0.002 of Claude
 * usage), then returns the snapshot.
 *
 * @returns The updated `UsageSnapshot`.
 */
export async function POST(): Promise<Response> {
  const tracker = getUsageTracker();
  await tracker.probeClaude();
  return Response.json(await tracker.snapshot());
}
