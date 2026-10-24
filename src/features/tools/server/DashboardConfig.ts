import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { appRoot, configPath } from "@/platform/paths";

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
    /** Linear status types to show, in display order. */
    states: z.array(z.string()).min(1).default(["started", "unstarted"]),
    limit: z.number().int().min(1).max(100).default(15),
  }),
  z.object({
    ...base,
    type: z.literal("slack"),
    ...source("slack", "Slack"),
    lookbackHours: z.number().int().min(1).max(24 * 14).default(48),
    limit: z.number().int().min(1).max(20).default(15),
    /** Your Slack user id; read from the Slack MCP tool description when omitted. */
    userId: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("nuclino"),
    ...source("nuclino", "Nuclino"),
    /** Workspace names; empty means every workspace you can access. */
    workspaces: z.array(z.string()).default([]),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  z.object({ ...base, type: z.literal("agents") }),
  z.object({ ...base, type: z.literal("questions") }),
]);

const dashboardConfigSchema = z.object({
  timezone: z.string().default("Asia/Seoul"),
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
 * Parsed `config/dashboard.yaml`.
 */
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;

/**
 * ### DashboardOverrides
 *
 * Choices that win over `dashboard.yaml`, such as those made in Settings.
 */
export type DashboardOverrides = {
  /** How each tool connects, by its MCP server name; `off` shows the tool as turned off. */
  connections: Partial<Record<string, "mcp" | "claude" | "off">>;
  /** Unset fields keep the file's values. */
  profile: { names?: Array<string>; slackUserId?: string; timezone?: string };
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
    if (custom !== undefined || !(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    return readFile(configPath("dashboard.example.yaml"), "utf8");
  });
  const raw: unknown = load(text);
  const config = applyOverrides(dashboardConfigSchema.parse(raw), overrides);
  const ids = config.widgets.map((w) => w.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate !== undefined) throw new Error(`dashboard.yaml: widget id "${duplicate}" is used twice`);
  return config;
}

function applyOverrides(config: DashboardConfig, { connections, profile }: DashboardOverrides): DashboardConfig {
  const widgets = config.widgets.map((widget): WidgetConfig => {
    if (!("server" in widget)) return widget;
    let next: WidgetConfig = widget;
    const choice = connections[widget.server];
    if (choice === "off") next = { ...next, disabled: true };
    else if (choice !== undefined) next = { ...next, via: choice === "mcp" ? "mcp" : "claude-connector", disabled: false };
    if (next.type === "slack" && profile.slackUserId !== undefined) next = { ...next, userId: profile.slackUserId };
    return next;
  });
  return {
    ...config,
    timezone: profile.timezone ?? config.timezone,
    me: profile.names === undefined ? config.me : { names: profile.names },
    widgets,
  };
}
