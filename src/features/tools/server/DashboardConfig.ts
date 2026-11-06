import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { appRoot, configPath } from "@/platform/paths";
import { isMissingFile } from "@/lib/errors";

const base = { id: z.string().regex(/^[a-z0-9-]+$/), title: z.string() };

/**
 * Where a tool widget gets its data:
 * - `mcp`: the server named `server` in mcp.yaml, called directly (free, fast).
 * - `claude-connector`: the claude.ai connector named `connector`, through a
 *   short Haiku relay (no extra setup, but each refresh uses Claude usage).
 */
const source = (server: string, connector: string) => ({
  via: z.enum(["mcp", "claude-connector"]).default("mcp"),
  server: z.string().default(server),
  connector: z.string().default(connector),
  /** Overrides the top-level `refreshSeconds` for this widget. */
  refreshSeconds: z.number().int().min(15).optional(),
  /** Shows "not connected" instead of loading; set when the tool is turned off in Settings. */
  disabled: z.boolean().default(false),
});

const widgetSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("calendar"),
    ...source("google_calendar", "Google Calendar"),
    calendars: z.array(z.string()).min(1).default(["primary"]),
  }),
  z.object({
    ...base,
    type: z.literal("linear"),
    ...source("linear", "Linear"),
    /** Linear status types to show, in display order; every open type by default. */
    states: z.array(z.string()).min(1).default(["started", "unstarted", "triage", "backlog"]),
    /** Most issues to show; every assigned issue when omitted. */
    limit: z.number().int().min(1).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("slack"),
    ...source("slack", "Slack"),
    lookbackHours: z.number().int().min(1).max(24 * 14).default(48),
    /** Most messages per kind (mentions, DMs, `@here` / `@channel`). */
    limit: z.number().int().min(1).max(20).default(15),
    /** Your Slack user id; read from the Slack MCP tool description when omitted. */
    userId: z.string().optional(),
    /** Also list `@here` / `@channel` in channels you are in (two more searches per load). */
    groupMentions: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal("nuclino"),
    ...source("nuclino", "Nuclino"),
    /** Workspace names; empty means every workspace you can access. */
    workspaces: z.array(z.string()).default([]),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  z.object({
    ...base,
    type: z.literal("notion"),
    ...source("notion", "Notion"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  z.object({ ...base, type: z.literal("agents") }),
  z.object({ ...base, type: z.literal("questions") }),
]);

const dashboardConfigSchema = z.object({
  /** Wins over this computer's zone; a zone chosen in Settings wins over it. */
  timezone: z.string().optional(),
  refreshSeconds: z.number().int().min(15).default(120),
  /** Names you go by, highlighted wherever tool content mentions you by name. */
  me: z.object({ names: z.array(z.string().min(2)).default([]) }).default({ names: [] }),
  widgets: z.array(widgetSchema),
});

/**
 * ### WidgetConfig
 *
 * One entry of `widgets` in `config/dashboard.yaml`, with defaults applied.
 */
export type WidgetConfig = z.infer<typeof widgetSchema>;

/**
 * ### DashboardConfig
 *
 * `config/dashboard.yaml` after validation, with every optional field
 * defaulted; the dashboard reads it with your Settings choices applied.
 *
 * @property timezone - The IANA zone for the calendar and "today", from {@link effectiveTimeZone}.
 * @property automaticTimezone - The zone used when none is chosen in Settings: the file's, else this computer's.
 */
export type DashboardConfig = Omit<z.infer<typeof dashboardConfigSchema>, "timezone"> & { timezone: string; automaticTimezone: string };

/**
 * ### DashboardOverrides
 *
 * Choices that win over `dashboard.yaml`, such as those made in Settings.
 */
export type DashboardOverrides = {
  /** How each tool connects, by its MCP server name; `off` shows the tool as turned off. */
  connections: Partial<Record<string, "mcp" | "claude" | "off">>;
  /** Unset fields keep the file's values. */
  profile: { names?: Array<string>; slackUserId?: string };
  /** The zone chosen in Settings; unset follows the file, else this computer. */
  timezone?: string;
  /** Whether the slack widget lists `@here` / `@channel`; unset keeps the file's value. */
  slackGroupMentions?: boolean;
};

const NO_OVERRIDES: DashboardOverrides = { connections: {}, profile: {} };

/**
 * ### loadDashboardConfig
 *
 * Reads `config/dashboard.yaml` (or `MOTHERSHIP_DASHBOARD_CONFIG`, relative to
 * the project root) fresh on every call so edits apply without a restart.
 * Without `config/dashboard.yaml`, `config/dashboard.example.yaml` is used.
 * `overrides` (choices made in Settings) win over the file.
 *
 * @returns The validated config.
 * @throws Error When widget ids repeat.
 */
export async function loadDashboardConfig(overrides: DashboardOverrides = NO_OVERRIDES): Promise<DashboardConfig> {
  // `||` on purpose: an empty MOTHERSHIP_DASHBOARD_CONFIG in .env.local means "use the default".
  const custom = process.env.MOTHERSHIP_DASHBOARD_CONFIG || undefined;
  const file = custom === undefined ? configPath("dashboard.yaml") : path.resolve(appRoot(), custom);
  // A fresh install has only the example (your own copy is git-ignored); use it until you make one.
  const text = await readFile(file, "utf8").catch((error: unknown) => {
    if (custom !== undefined || !isMissingFile(error)) throw error;
    return readFile(configPath("dashboard.example.yaml"), "utf8");
  });
  const raw: unknown = load(text);
  const parsed = dashboardConfigSchema.parse(raw);
  const zones = { file: parsed.timezone, computer: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const timezone = effectiveTimeZone({ ...zones, chosen: overrides.timezone });
  const automaticTimezone = effectiveTimeZone({ ...zones, chosen: undefined });
  const config = applyOverrides(withAddedTools({ ...parsed, timezone, automaticTimezone }), overrides);
  const ids = config.widgets.map((w) => w.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate !== undefined) throw new Error(`dashboard.yaml: widget id "${duplicate}" is used twice`);
  return config;
}

/**
 * ### effectiveTimeZone
 *
 * The zone the calendar and "today" use: the one chosen in Settings, else
 * the one `dashboard.yaml` sets, else this computer's. A blank zone counts
 * as unset.
 *
 * @param computer - This computer's zone as `Intl` reports it; `UTC` when that is blank.
 */
export function effectiveTimeZone({ chosen, file, computer }: { chosen: string | undefined; file: string | undefined; computer: string }): string {
  const set = (zone: string | undefined) => (zone === undefined || zone.trim() === "" ? undefined : zone.trim());
  return set(chosen) ?? set(file) ?? set(computer) ?? "UTC";
}

/** Tools added after many `dashboard.yaml` files were written, with the widget they get when the file has none. */
const ADDED_TOOLS: Array<Record<string, unknown>> = [{ id: "notion", type: "notion", title: "Recent Notion pages" }];

/**
 * ### withAddedTools
 *
 * Gives a file written before a tool existed that tool's widget, so turning
 * it on in Settings is enough. A widget of the same type, or one already
 * using its id, counts as having it.
 */
export function withAddedTools(config: DashboardConfig): DashboardConfig {
  const missing = ADDED_TOOLS.filter((added) => !config.widgets.some((w) => w.type === added.type || w.id === added.id));
  return missing.length === 0 ? config : { ...config, widgets: [...config.widgets, ...missing.map((w) => widgetSchema.parse(w))] };
}

/**
 * ### applyOverrides
 *
 * Lays your Settings choices over the file: a tool's connection (matched by
 * the widget's MCP server name) turns it off or picks how it connects, and
 * set profile fields replace the file's.
 */
export function applyOverrides(config: DashboardConfig, { connections, profile, slackGroupMentions }: DashboardOverrides): DashboardConfig {
  const widgets = config.widgets.map((widget): WidgetConfig => {
    if (!("server" in widget)) return widget;
    let next: WidgetConfig = widget;
    const choice = connections[widget.server];
    if (choice === "off") next = { ...next, disabled: true };
    else if (choice !== undefined) next = { ...next, via: choice === "mcp" ? "mcp" : "claude-connector", disabled: false };
    if (next.type === "slack" && profile.slackUserId !== undefined) next = { ...next, userId: profile.slackUserId };
    if (next.type === "slack" && slackGroupMentions !== undefined) next = { ...next, groupMentions: slackGroupMentions };
    return next;
  });
  return {
    ...config,
    me: profile.names === undefined ? config.me : { names: profile.names },
    widgets,
  };
}
