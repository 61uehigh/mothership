import { connection } from "next/server";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { keyBindingSchema, readKeyOverrides, setKeyOverride } from "@/features/settings/server/keybindingsStore";

const putSchema = z.object({ id: z.string().min(1), keys: z.array(keyBindingSchema).max(3).nullable() });

/**
 * ### GET
 *
 * @returns `{ overrides }`: command id → keys.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ overrides: await readKeyOverrides() });
}

/**
 * ### PUT
 *
 * Sets one command's keys (`keys: []` turns it off), or restores the default
 * with `keys: null`.
 *
 * @returns The updated `{ overrides }`, or 400 for an invalid binding.
 */
export async function PUT(request: Request): Promise<Response> {
  const body = await parseBody(request, putSchema);
  if (body instanceof Response) return body;
  return Response.json({ overrides: await setKeyOverride(body.id, body.keys) });
}
