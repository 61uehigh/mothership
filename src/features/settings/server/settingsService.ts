import { envReferences, readMcpFile } from "@/platform/mcp/McpRegistry";
import { workspaceDir } from "@/platform/paths";
import {
  CONNECTIONS,
  type CheckResult,
  type ConnectionId,
  type ConnectionMode,
  type ConnectionTest,
  type ConnectionView,
  type SettingsView,
} from "@/features/settings/model/Settings";
import { hasEnvFile } from "@/features/settings/server/envFile";
import { readSettings } from "@/features/settings/server/settingsStore";

const isSet = (name: string) => (process.env[name] ?? "") !== "";
const secret = (name: string) => ({ name, set: isSet(name) });

/**
 * ### SidebarState
 *
 * How the sidebar reads each tool today, as Settings needs to know it.
 */
export type SidebarState = {
  /** Each tool's widget by MCP server name; a tool without a widget is missing. */
  widgets: Partial<Record<ConnectionId, { via: "mcp" | "claude-connector"; disabled: boolean }>>;
  profile: SettingsView["profile"];
};

/**
 * ### SettingsDeps
 *
 * What Settings asks of the rest of the app, and nothing more.
 */
export type SettingsDeps = {
  /** Whether each agent provider can run. */
  agents: () => Promise<SettingsView["agents"]>;
  /** Whether each developer tool is ready. */
  tools: { github: () => Promise<CheckResult>; docker: () => Promise<CheckResult> };
  /** The sidebar's current sources and your profile. */
  sidebar: () => Promise<SidebarState>;
  /** Loads a tool's sidebar section fresh, by MCP server name. */
  test: (id: ConnectionId) => Promise<ConnectionTest>;
};

/**
 * ### SettingsService
 *
 * Builds what the Settings screen shows and tests connections. Holds no
 * secret values: only whether each one is set.
 */
export class SettingsService {
  readonly #deps: SettingsDeps;

  constructor(deps: SettingsDeps) {
    this.#deps = deps;
  }

  /**
   * ### view
   *
   * @returns Readiness of agents and tools, each connection, and your profile.
   */
  async view(): Promise<SettingsView> {
    const [settings, mcp, sidebar, envFile, agents, github, docker] = await Promise.all([
      readSettings(),
      readMcpFile(),
      this.#deps.sidebar(),
      hasEnvFile(),
      this.#deps.agents(),
      this.#deps.tools.github(),
      this.#deps.tools.docker(),
    ]);

    const connections = CONNECTIONS.map((id): ConnectionView => {
      const server = mcp.config.servers[id];
      const connector = mcp.config.claudeConnectors[id];
      const widget = sidebar.widgets[id];
      const chosen = mcp.custom ? undefined : settings.connections[id];
      // Without a choice, follow the files: the sidebar widget's source, else the server switch.
      const fromFiles: ConnectionMode =
        widget !== undefined
          ? widget.disabled
            ? "off"
            : widget.via === "claude-connector"
              ? "claude"
              : server?.enabled === true
                ? "mcp"
                : "off"
          : server?.enabled === true
            ? "mcp"
            : connector !== undefined
              ? "claude"
              : "off";
      const modes: Array<ConnectionMode> = [...(server === undefined ? [] : ["mcp" as const]), ...(connector === undefined ? [] : ["claude" as const]), "off"];
      return {
        id,
        mode: chosen ?? fromFiles,
        chosen: chosen !== undefined,
        modes,
        secrets: server === undefined ? [] : envReferences(server).map(secret),
        connector,
      };
    });

    return {
      setupNeeded: !settings.setupDone && !envFile,
      customConfig: mcp.custom ? mcp.file : undefined,
      agents,
      tools: { github, docker },
      connections,
      agentSecrets: [secret("ANTHROPIC_API_KEY"), secret("OPENAI_API_KEY")],
      profile: sidebar.profile,
      defaultFolder: { chosen: settings.defaultFolder, fallback: workspaceDir() },
    };
  }

  /**
   * ### test
   *
   * Loads the tool's sidebar section fresh, the same way the sidebar does.
   *
   * @returns How many items came back, or why it failed.
   */
  test(id: ConnectionId): Promise<ConnectionTest> {
    return this.#deps.test(id);
  }
}
