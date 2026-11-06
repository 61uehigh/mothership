import { connection } from "next/server";
import { loadRoles } from "@/features/sessions/server/roles";

/**
 * ### GET
 *
 * @returns Role presets from `config/roles.yaml`.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await loadRoles());
}
