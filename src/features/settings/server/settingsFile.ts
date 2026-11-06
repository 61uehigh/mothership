import { copyFile, readFile } from "node:fs/promises";
import { z } from "zod";
import { writeQueueFor, toJsonFile, writeFileAtomic } from "@/platform/files";
import { dataPath } from "@/platform/paths";
import { CONNECTIONS, type ConnectionId, type ConnectionMode, type SettingsPatch } from "@/features/settings/model/Settings";
import { DEFAULT_INBOX_RULES, inboxRulesSchema } from "@/features/inbox/model/Inbox";
import { meetingCollectionSchema } from "@/features/meetings/model/Meetings";
import { DEFAULT_LEAD, leadChoiceSchema, type LeadChoice } from "@/features/sessions/model/Lead";
import { isMissingFile } from "@/lib/errors";

const file = () => dataPath(".mothership", "settings.json");

const connectionModeSchema = z.enum(["mcp", "claude", "off"]);
const nameSchema = z.string().min(2);

const fields = {
  /** Set when you finish the welcome steps, so Settings stops opening on start. */
  setupDone: z.boolean().default(false),
  /** The folder a new session works in when you leave its folder empty. */
  defaultFolder: z.string().optional(),
  /** Who leads new sessions (Settings → Agents, and the New session dialog's last choice); Claude until chosen. A choice that can no longer lead is dropped. */
  lead: leadChoiceSchema.optional().catch(undefined),
  /** Sessions stopped by an app restart continue on their own when mothership starts again; off until you turn it on. */
  autoContinue: z.boolean().default(false),
  /** Agents suggest your next prompt after a turn, shown in the reply box; on until you turn it off. */
  promptSuggestions: z.boolean().default(true),
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
  connections: z.partialRecord(z.enum(CONNECTIONS), connectionModeSchema).default({}),
  /** Overrides for `config/dashboard.yaml`; unset fields keep the file's values. */
  profile: z
    .object({
      names: z.array(nameSchema).optional(),
      slackUserId: z.string().optional(),
    })
    .default({}),
  /** The IANA zone chosen in Settings → General; unset follows `dashboard.yaml`, else this computer. */
  timezone: z.string().optional(),
};

const storedSettingsSchema = z.object(fields);

/**
 * ### StoredSettings
 *
 * What the Settings screen saves in `.mothership/settings.json` (git-ignored).
 * Secrets never go here; they go to `.env.local`.
 */
export type StoredSettings = z.infer<typeof storedSettingsSchema>;

const EMPTY: StoredSettings = storedSettingsSchema.parse({});

function orDefault<T extends z.ZodType>(field: T) {
  return field.catch(() => field.parse(undefined));
}

const anyRecord = z.record(z.string(), z.unknown()).catch({});
const anyList = z.array(z.unknown()).catch([]);
const optionalText = z.string().optional().catch(undefined);

function validOnly<T>(schema: z.ZodType<T>, items: Array<unknown>): Array<T> {
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// One bad value (an older build reading a newer file, a hand edit, a
// connection id that was since removed) costs only that value, not every setting.
const lenientSettingsSchema = z.object({
  setupDone: orDefault(fields.setupDone),
  defaultFolder: orDefault(fields.defaultFolder),
  lead: fields.lead,
  autoContinue: orDefault(fields.autoContinue),
  promptSuggestions: orDefault(fields.promptSuggestions),
  developer: orDefault(fields.developer),
  inbox: anyRecord.transform((saved) => {
    const rules: Record<string, unknown> = { ...DEFAULT_INBOX_RULES };
    for (const [key, rule] of Object.entries(inboxRulesSchema.shape)) {
      const parsed = rule.safeParse(saved[key]);
      if (parsed.success) rules[key] = parsed.data;
    }
    return inboxRulesSchema.parse(rules);
  }),
  meetings: anyRecord.transform((saved) => ({ collections: validOnly(meetingCollectionSchema, anyList.parse(saved.collections)) })),
  connections: anyRecord.transform((saved) => {
    const kept: Partial<Record<ConnectionId, ConnectionMode>> = {};
    for (const id of CONNECTIONS) {
      const mode = connectionModeSchema.safeParse(saved[id]);
      if (mode.success) kept[id] = mode.data;
    }
    return kept;
  }),
  profile: anyRecord.transform((saved) => ({
    names: saved.names === undefined ? undefined : validOnly(nameSchema, anyList.parse(saved.names)),
    slackUserId: optionalText.parse(saved.slackUserId),
  })),
  timezone: optionalText,
});

/** Builds before the time zone moved to General kept it as `profile.timezone`; a choice made there is kept. */
function withLegacyTimezone(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.timezone !== undefined) return raw;
  const legacy = anyRecord.parse(raw.profile).timezone;
  return typeof legacy === "string" && legacy !== "" ? { ...raw, timezone: legacy } : raw;
}

/**
 * ### ParsedSettings
 *
 * The settings read from the file, and whether reading them dropped
 * anything (a value that failed its schema, or text that is not JSON at
 * all), in which case the file is kept aside before it is replaced.
 */
export type ParsedSettings = { settings: StoredSettings; dropped: boolean };

/**
 * ### parseSettingsText
 *
 * Reads `settings.json`'s text value by value: an invalid field falls back
 * to its default and an invalid entry (a connection, a name, a meeting
 * collection, an Inbox rule) is left out, while everything valid is kept.
 */
export function parseSettingsText(text: string): ParsedSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { settings: EMPTY, dropped: true };
  }
  const settings = lenientSettingsSchema.parse(typeof raw === "object" && raw !== null && !Array.isArray(raw) ? withLegacyTimezone(anyRecord.parse(raw)) : {});
  return { settings, dropped: !storedSettingsSchema.safeParse(raw).success };
}

/**
 * ### readSettings
 *
 * Read fresh on every call, like the config files, so a change applies at once.
 *
 * @returns The saved settings, with defaults for anything missing or
 *   invalid; all defaults when the file is missing or cannot be read.
 */
export async function readSettings(): Promise<StoredSettings> {
  try {
    return parseSettingsText(await readFile(file(), "utf8")).settings;
  } catch {
    return EMPTY;
  }
}

/**
 * ### updateSettings
 *
 * A read-change-write that runs whole inside the file's write queue. When
 * the saved file had anything that did not parse, it is first copied to
 * `settings.json.bad-<ms>`, so the write cannot lose it for good.
 *
 * @param change - Returns the new settings from the current ones.
 * @returns The settings as saved.
 * @throws When the file exists but cannot be read (permissions, for
 *   example); nothing is written then.
 */
export function updateSettings(change: (settings: StoredSettings) => StoredSettings): Promise<StoredSettings> {
  return writeQueueFor(file())(async () => {
    const text = await readFile(file(), "utf8").catch((error: unknown) => {
      if (isMissingFile(error)) return undefined;
      throw error;
    });
    const current = text === undefined ? { settings: EMPTY, dropped: false } : parseSettingsText(text);
    if (current.dropped) await copyFile(file(), `${file()}.bad-${Date.now()}`);
    const next = storedSettingsSchema.parse(change(current.settings));
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
  return {
    setupDone: patch.setupDone ?? current.setupDone,
    defaultFolder: patch.defaultFolder === undefined ? current.defaultFolder : patch.defaultFolder || undefined,
    lead: patch.lead === undefined ? current.lead : patch.lead,
    autoContinue: patch.autoContinue ?? current.autoContinue,
    promptSuggestions: patch.promptSuggestions ?? current.promptSuggestions,
    developer: {
      enabled: patch.developer?.enabled ?? current.developer.enabled,
      sourceFolder: patch.developer?.sourceFolder === undefined ? current.developer.sourceFolder : patch.developer.sourceFolder || undefined,
    },
    inbox: { ...current.inbox, ...patch.inbox },
    meetings: patch.meetings ?? current.meetings,
    connections,
    profile,
    timezone: patch.timezone === undefined ? current.timezone : patch.timezone || undefined,
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
