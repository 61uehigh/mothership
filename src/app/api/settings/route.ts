import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { connection } from "next/server";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { settingsPatchSchema } from "@/features/settings/model/Settings";
import { afterSettingsChange, getSettings } from "@/composition/server";
import { isMothershipCheckout } from "@/platform/checkout";

/** A folder on this Mac; `~` stands for your home folder. Empty stays empty. */
const folderSchema = z
  .string()
  .trim()
  .transform((dir) => (dir === "~" || dir.startsWith("~/") ? path.join(homedir(), dir.slice(1)) : dir))
  .superRefine(async (dir, context) => {
    if (dir === "") return;
    if (!path.isAbsolute(dir)) context.addIssue({ code: "custom", message: "Use a full path, such as /Users/you/projects" });
    else if (
      !(await stat(/*turbopackIgnore: true*/ dir).then(
        (s) => s.isDirectory(),
        () => false,
      ))
    )
      context.addIssue({ code: "custom", message: `No folder at ${dir}` });
  })
  .transform((dir) => (dir === "" ? "" : path.resolve(dir)));

const bodySchema = settingsPatchSchema.extend({
  defaultFolder: folderSchema.optional(),
  developer: settingsPatchSchema.shape.developer
    .unwrap()
    .extend({ sourceFolder: folderSchema.refine((dir) => dir === "" || isMothershipCheckout(dir), "Not a git checkout of mothership").optional() })
    .optional(),
});

/**
 * ### GET
 *
 * @returns The `SettingsView`: readiness of agents and tools, each connection, and your profile.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(await getSettings().view());
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
  await getSettings().update(body);
  // Sections switch source right away instead of serving results from the old one.
  await afterSettingsChange();
  return Response.json(await getSettings().view());
}
