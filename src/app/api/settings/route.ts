import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { connection } from "next/server";
import { z } from "zod";
import { parseBody } from "@/app/api/_lib/http";
import { CONNECTIONS } from "@/features/settings/model/Settings";
import { afterSettingsChange, getSettings } from "@/composition/server";
import { updateSettings } from "@/features/settings/server/settingsStore";

const timezoneSchema = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, "Not a known time zone");

/** A folder on this Mac; `~` stands for your home folder. Empty stays empty. */
const folderSchema = z
  .string()
  .trim()
  .transform((dir) => (dir === "~" || dir.startsWith("~/") ? path.join(homedir(), dir.slice(1)) : dir))
  .superRefine(async (dir, context) => {
    if (dir === "") return;
    if (!path.isAbsolute(dir)) context.addIssue({ code: "custom", message: "Use a full path, such as /Users/you/projects" });
    else if (!(await stat(/*turbopackIgnore: true*/ dir).then((s) => s.isDirectory(), () => false))) context.addIssue({ code: "custom", message: `No folder at ${dir}` });
  })
  .transform((dir) => (dir === "" ? "" : path.resolve(dir)));

const bodySchema = z.object({
  /** A mode per tool; `default` forgets the choice so the config files decide again. */
  connections: z.partialRecord(z.enum(CONNECTIONS), z.enum(["mcp", "claude", "off", "default"])).optional(),
  profile: z
    .object({
      names: z.array(z.string().trim().min(2)).optional(),
      /** Empty clears it. */
      slackUserId: z.union([z.literal(""), z.string().regex(/^[UW][A-Z0-9]{6,}$/, "A Slack member id looks like U0123456789")]).optional(),
      /** Empty clears it. */
      timezone: z.union([z.literal(""), timezoneSchema]).optional(),
    })
    .optional(),
  setupDone: z.boolean().optional(),
  /** Empty forgets it, so sessions fall back to your home folder. */
  defaultFolder: folderSchema.optional(),
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
 * `profile`, `setupDone`, `defaultFolder`; fields left out are kept.
 *
 * @returns The updated `SettingsView`, or 400 for an invalid body.
 */
export async function PATCH(request: Request): Promise<Response> {
  const body = await parseBody(request, bodySchema);
  if (body instanceof Response) return body;
  await updateSettings((current) => {
    const connections = { ...current.connections };
    for (const [id, mode] of Object.entries(body.connections ?? {})) {
      const key = z.enum(CONNECTIONS).parse(id);
      if (mode === "default") delete connections[key];
      else if (mode !== undefined) connections[key] = mode;
    }
    const profile = { ...current.profile };
    if (body.profile?.names !== undefined) profile.names = body.profile.names;
    if (body.profile?.slackUserId !== undefined) profile.slackUserId = body.profile.slackUserId || undefined;
    if (body.profile?.timezone !== undefined) profile.timezone = body.profile.timezone || undefined;
    const defaultFolder = body.defaultFolder === undefined ? current.defaultFolder : body.defaultFolder || undefined;
    return { setupDone: body.setupDone ?? current.setupDone, defaultFolder, connections, profile };
  });
  // Sections switch source right away instead of serving results from the old one.
  await afterSettingsChange();
  return Response.json(await getSettings().view());
}
