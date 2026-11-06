import { connection } from "next/server";
import { getDashboard } from "@/composition/server";

/**
 * ### GET
 *
 * @returns The widget list from `config/dashboard.yaml` and the refresh interval.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getDashboard().widgets());
}
