import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeQueueFor, toJsonFile, writeFileAtomic } from "@/platform/files";
import { dataPath } from "@/platform/paths";
import { CONNECTIONS, type SettingsPatch } from "@/features/settings/model/Settings";
import { DEFAULT_INBOX_RULES, inboxRulesSchema } from "@/features/inbox/model/Inbox";
import { meetingCollectionSchema } from "@/features/meetings/model/Meetings";
import { DEFAULT_LEAD, leadChoiceSchema, type LeadChoice } from "@/features/sessions/model/Lead";

const file = () => dataPath(".mothership", "settings.json");

const storedSettingsSchema = z.object({
  /** Set when you finish the welcome steps, so Settings stops opening on start. */
  setupDone: z.boolean().default(false),
  /** The folder a new session works in when you leave its folder empty. */
  defaultFolder: z.string().optional(),
  /** Who leads new sessions (Settings → Agents, and the New session dialog's last choice); Claude until chosen. A choice that can no longer lead is dropped. */
  lead: leadChoiceSchema.optional().catch(undefined),
  /** Developer mode: feedback that becomes a session working on mothership's own source. */
  developer: z.object({ enabled: z.boolean().default(false), sourceFolder: z.string().optional() }).default({ enabled: false }),
  /** How the Inbox sorts items (Settings → Inbox). */
  inbox: inboxRulesSchema
    .partial()
    .default({})
    .transform((saved) => ({ ...DEFAULT_INBOX_RULES, ...saved })),
  /** Nuclino collections the Meetings section lists notes from (Settings → Meetings). */
  meetings: z.object({ collections: z.array(meetingCollectionSchema).default([]) }).default({ collections: [] }),
  /** Your choice per tool; a tool you have not chosen for follows the config files. */
  connections: z.partialRecord(z.enum(CONNECTIONS), z.enum(["mcp", "claude", "off"])).default({}),
  /** Overrides for `config/dashboard.yaml`; unset fields keep the file's values. */
  profile: z
    .object({
      names: z.array(z.string().min(2)).optional(),
      slackUserId: z.string().optional(),
      timezone: z.string().optional(),
    })
    .default({}),
});

/**
 * ### StoredSettings
 *
 * What the Settings screen saves in `.mothership/settings.json` (git-ignored).
 * Secrets never go here; they go to `.env.local`.
 */
export type StoredSettings = z.infer<typeof storedSettingsSchema>;

const EMPTY: StoredSettings = { setupDone: false, connections: {}, profile: {}, developer: { enabled: false }, inbox: DEFAULT_INBOX_RULES, meetings: { collections: [] } };

/**
 * ### readSettings
 *
 * Read fresh on every call, like the config files, so a change applies at once.
 *
 * @returns The saved settings; defaults when the file is missing or broken.
 */
export async function readSettings(): Promise<StoredSettings> {
  try {
    return storedSettingsSchema.parse(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    // Missing or hand-broken file: fall back to the config files rather than failing.
    return EMPTY;
  }
}


/**
 * ### updateSettings
 *
 * @param change - Returns the new settings from the current ones.
 * @returns The settings as saved.
 */
export function updateSettings(change: (settings: StoredSettings) => StoredSettings): Promise<StoredSettings> {
  return writeQueueFor(file())(async () => {
    const next = storedSettingsSchema.parse(change(await readSettings()));
    await writeFileAtomic(file(), toJsonFile(next));
    return next;
  });
}

/**
 * ### applySettingsPatch
 *
 * Merges a change into the saved settings: fields left out are kept, an
 * empty text field is cleared, Inbox rules merge one by one, and a
 * connection set to `default` is forgotten.
 */
export function applySettingsPatch(current: StoredSettings, patch: SettingsPatch): StoredSettings {
  const connections = { ...current.connections };
  for (const id of CONNECTIONS) {
    const mode = patch.connections?.[id];
    if (mode === "default") delete connections[id];
    else if (mode !== undefined) connections[id] = mode;
  }
  const profile = { ...current.profile };
  if (patch.profile?.names !== undefined) profile.names = patch.profile.names;
  if (patch.profile?.slackUserId !== undefined) profile.slackUserId = patch.profile.slackUserId || undefined;
  if (patch.profile?.timezone !== undefined) profile.timezone = patch.profile.timezone || undefined;
  return {
    setupDone: patch.setupDone ?? current.setupDone,
    defaultFolder: patch.defaultFolder === undefined ? current.defaultFolder : patch.defaultFolder || undefined,
    lead: patch.lead === undefined ? current.lead : patch.lead,
    developer: {
      enabled: patch.developer?.enabled ?? current.developer.enabled,
      sourceFolder: patch.developer?.sourceFolder === undefined ? current.developer.sourceFolder : patch.developer.sourceFolder || undefined,
    },
    inbox: { ...current.inbox, ...patch.inbox },
    meetings: patch.meetings ?? current.meetings,
    connections,
    profile,
  };
}

/**
 * ### savedLead
 *
 * @returns Who leads new sessions: your saved choice, else {@link DEFAULT_LEAD}.
 */
export function savedLead(settings: Pick<StoredSettings, "lead">): LeadChoice {
  const lead = settings.lead;
  return lead === undefined ? DEFAULT_LEAD : { provider: lead.provider, model: lead.model, effort: lead.effort };
}
