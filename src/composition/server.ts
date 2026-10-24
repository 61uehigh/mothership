import { checkDocker } from "@/features/docker/server/cli";
import { FileService } from "@/features/explorer/server/FileService";
import { checkGitHubCli } from "@/features/github/server/gh";
import { AgentRuntime } from "@/features/sessions/server/AgentRuntime";
import { AgentStore } from "@/features/sessions/server/AgentStore";
import { checkProviders } from "@/features/sessions/server/providerChecks";
import { isConnectionId, type ConnectionId, type ConnectionTest } from "@/features/settings/model/Settings";
import { SettingsService, type SidebarState } from "@/features/settings/server/settingsService";
import { readSettings } from "@/features/settings/server/settingsStore";
import { TOOL_KINDS, type ToolKind } from "@/features/tools/model/Dashboard";
import { loadDashboardConfig, type DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { DashboardService, type WidgetResults } from "@/features/tools/server/DashboardService";
import { DETAIL_PREFIXES, DetailCache } from "@/features/tools/server/detailCache";
import { slackUserId } from "@/features/tools/slack/server/slackSource";
import { TOOL_SOURCES } from "@/features/tools/server/toolSources";
import { UsageTracker } from "@/features/usage/server/UsageTracker";
import { connectorCaller } from "@/platform/mcp/ClaudeConnectorRelay";
import { McpClientPool } from "@/platform/mcp/McpClientPool";
import { loadMcpConfig, type McpConfig } from "@/platform/mcp/McpRegistry";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";
import { appPath, dataPath, workspaceDir } from "@/platform/paths";

/**
 * Everything that holds state. Kept on `globalThis` because each route can
 * load its own copy of this module and a dev reload loads a new one; they
 * must all share one runtime, one set of MCP connections, and one cache.
 */
type State = {
  usage: UsageTracker;
  pool: McpClientPool;
  runtime: AgentRuntime;
  widgetResults: WidgetResults;
  details: DetailCache;
};

// Widening only: adds our optional slot to `globalThis`, which is otherwise untyped for it.
const globalRef = globalThis as typeof globalThis & { __mothership?: State };

/** A custom MCP config (demo mode) names made-up tools, so your Settings choices don't apply to it. */
const usesCustomConfig = () => Boolean(process.env.MOTHERSHIP_MCP_CONFIG);

/**
 * ### mcpConfig
 *
 * @returns The MCP config with your Settings choices applied.
 */
export async function mcpConfig(): Promise<McpConfig> {
  return loadMcpConfig(usesCustomConfig() ? {} : (await readSettings()).connections);
}

/**
 * ### dashboardConfig
 *
 * @returns The sidebar config with your Settings choices applied.
 */
export async function dashboardConfig(): Promise<DashboardConfig> {
  const { connections, profile } = await readSettings();
  return loadDashboardConfig({ connections: usesCustomConfig() ? {} : connections, profile });
}

/**
 * ### defaultFolder
 *
 * @returns The folder a new session works in when you leave its folder empty:
 *   your choice in Settings, else `MOTHERSHIP_WORKSPACE`, else your home folder.
 */
export async function defaultFolder(): Promise<string> {
  return (await readSettings()).defaultFolder ?? workspaceDir();
}

function state(): State {
  if (globalRef.__mothership === undefined) {
    // The desktop app runs this server with Electron's binary as Node. Agents, git, and other
    // programs started from here should see an ordinary environment, so the switch stops here
    // (the control MCP server, which also runs Electron's binary, sets it again for itself).
    delete process.env.ELECTRON_RUN_AS_NODE;
    const usage = new UsageTracker();
    const onRateLimit = (info: unknown) => usage.recordClaude(info);
    const runtime = new AgentRuntime({
      store: new AgentStore(dataPath(".mothership", "mothership.db")),
      defaultFolder,
      worktreesDir: dataPath(".mothership", "worktrees"),
      // `||` on purpose: the .env template leaves this as an empty string.
      baseUrl: process.env.MOTHERSHIP_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
      environment: { mcpConfig, onRateLimit, controlScript: appPath("scripts", "control-mcp.mjs") },
    });
    globalRef.__mothership = {
      usage,
      pool: new McpClientPool(),
      runtime,
      widgetResults: { cache: new Map(), inflight: new Map() },
      details: new DetailCache(),
    };
  }
  return globalRef.__mothership;
}

/**
 * ### getRuntime
 *
 * @returns The agent runtime: sessions, turns, worktrees, and questions.
 */
export function getRuntime(): AgentRuntime {
  return state().runtime;
}

/**
 * ### getUsageTracker
 *
 * @returns Claude and Codex usage limits and this Mac's load.
 */
export function getUsageTracker(): UsageTracker {
  return state().usage;
}

/**
 * ### getDetailCache
 *
 * @returns The cache of tool detail views (threads, events).
 */
export function getDetailCache(): DetailCache {
  return state().details;
}

function connector(name: string): ToolCaller {
  const { usage } = state();
  return connectorCaller(name, { onRateLimit: (info) => usage.recordClaude(info) });
}

/**
 * ### getDashboard
 *
 * @returns The sidebar's work-tool widgets and the search across tools.
 */
export function getDashboard(): DashboardService {
  const { pool, widgetResults } = state();
  return new DashboardService({
    sources: TOOL_SOURCES,
    loadConfig: dashboardConfig,
    mcpConfig,
    mcpCaller: (server) => pool.caller(server),
    connectorCaller: connector,
    results: widgetResults,
  });
}

/**
 * ### forgetAfterWrite
 *
 * After a successful change made from mothership (a sent message, a
 * reaction, an RSVP): drops the tool's cached details and its widgets'
 * cached results, so both show the change.
 */
export async function forgetAfterWrite(kind: keyof typeof DETAIL_PREFIXES & ToolKind): Promise<void> {
  getDetailCache().forget(DETAIL_PREFIXES[kind]);
  await getDashboard().invalidate(kind);
}

/**
 * ### afterSettingsChange
 *
 * After a change in Settings (a connection, a token, your profile): drops
 * cached widget results and details, which may come from the old source or
 * settings, and closes MCP connections that are no longer used.
 */
export async function afterSettingsChange(): Promise<void> {
  getDetailCache().forget("");
  await Promise.all(TOOL_KINDS.map((kind) => getDashboard().invalidate(kind)));
  const { servers } = await mcpConfig().catch(() => ({ servers: [] }));
  await state().pool.retain(new Set(servers.map((s) => s.name)));
}

/**
 * ### getFiles
 *
 * @returns The Explorer's file service; a session root is that session's folder.
 */
export function getFiles(): FileService {
  const { runtime } = state();
  return new FileService({ workspace: defaultFolder, sessionFolder: (id) => runtime.detail(id)?.agent.workingDirectory });
}

/**
 * ### sessionFolders
 *
 * @returns Each session's repository (or working folder), for finding local GitHub repositories.
 */
export function sessionFolders(): Array<string> {
  return getRuntime()
    .snapshot()
    .agents.map((agent) => agent.worktree?.repo ?? agent.workingDirectory);
}

async function sidebarState(): Promise<SidebarState> {
  const config = await dashboardConfig();
  const widgets: SidebarState["widgets"] = {};
  for (const widget of config.widgets) {
    if (!("server" in widget) || !isConnectionId(widget.server)) continue;
    widgets[widget.server] ??= { via: widget.via, disabled: widget.disabled };
  }
  return { widgets, profile: { names: config.me.names, slackUserId: slackUserId(config), timezone: config.timezone } };
}

async function testConnection(id: ConnectionId): Promise<ConnectionTest> {
  const result = await getDashboard().loadBySource(id);
  if (result === undefined) return { ok: false, message: `No sidebar section uses ${id}; add one to config/dashboard.yaml.` };
  switch (result.status) {
    case "ok":
      return { ok: true, items: result.items.length };
    case "unavailable":
      return { ok: false, message: result.reason };
    case "error":
      return { ok: false, message: result.message };
  }
}

/**
 * ### getSettings
 *
 * @returns The Settings screen's service.
 */
export function getSettings(): SettingsService {
  return new SettingsService({
    agents: checkProviders,
    tools: { github: checkGitHubCli, docker: checkDocker },
    sidebar: sidebarState,
    test: testConnection,
  });
}
