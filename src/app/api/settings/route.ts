import { connection } from "next/server";
import { parseBody } from "@/app/api/_lib/http";
import { folderSchema } from "@/app/api/_lib/folderSchema";
import { settingsPatchSchema } from "@/features/settings/model/Settings";
import { afterSettingsChange, getSettingsService } from "@/composition/server";
import type { ApiErrorCode } from "@/lib/apiErrorCodes";
import { isMothershipCheckout } from "@/platform/checkout";

const bodySchema = settingsPatchSchema.extend({
  defaultFolder: folderSchema.optional(),
  developer: settingsPatchSchema.shape.developer
    .unwrap()
    .extend({ sourceFolder: folderSchema.refine((dir) => dir === "" || isMothershipCheckout(dir), { message: "Not a git checkout of mothership", params: { code: "not-mothership-checkout" satisfies ApiErrorCode } }).optional() })
    .optional(),
});

/**
 * ### GET
 *
 * @returns The `SettingsView`: readiness of agents and tools, each connection, and your profile.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getSettingsService().view());
}

/**
 * ### PATCH
 *
 * Saves choices to `.mothership/settings.json`. Body: any of `connections`,
 * `profile`, `setupDone`, `defaultFolder`, `developer`, `inbox`, `meetings`; fields left out are kept.
 *
 * @returns The updated `SettingsView`, or 400 for an invalid body.
 */
export async function PATCH(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  await getSettingsService().update(body);
  // Sections switch source right away instead of serving results from the old one.
  await afterSettingsChange();
  return Response.json(await getSettingsService().view());
}
