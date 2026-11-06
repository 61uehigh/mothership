import { envReferences, readMcpFile } from "@/platform/mcp/mcpConfig";
import { runningCheckout } from "@/platform/checkout";
import { workspaceDir } from "@/platform/paths";
import {
  CONNECTIONS,
  type CheckResult,
  type ConnectionId,
  type ConnectionMode,
  type ConnectionTest,
  type ConnectionView,
  type SettingsPatch,
  type SettingsView,
} from "@/features/settings/model/Settings";
import { diagnoseConnection } from "@/features/settings/model/connectionDiagnosis";
import type { WidgetResult } from "@/features/tools/model/Dashboard";
import { hasEnvFile } from "@/features/settings/server/envFile";
import { googleSignedIn, oauthClientProblem } from "@/features/settings/server/googleOAuthClient";
import { whoAmI } from "@/features/settings/server/whoAmI";
import { applySettingsPatch, readSettings, savedLead, updateSettings } from "@/features/settings/server/settingsStore";
import { hasEnvSecret } from "@/platform/envSecret";

const secret = (name: string) => {
  const problem = name === "GOOGLE_OAUTH_CREDENTIALS" ? oauthClientProblem() : undefined;
  return { name, set: hasEnvSecret(name), ...(problem === undefined ? {} : { problem }) };
};

/** A sidebar section's result, as a connection test reads it. */
function asTest(result: WidgetResult): ConnectionTest {
  switch (result.status) {
    case "ok":
      return { ok: true, items: result.items.length };
    case "unavailable":
      return { ok: false, message: result.reason };
    case "error":
      return { ok: false, message: result.message };
  }
}

/** Adds what the failure means, so the card can say what to do. */
function withProblem(id: ConnectionId, result: ConnectionTest): ConnectionTest {
  if (result.ok || result.problem !== undefined) return result;
  const problem = diagnoseConnection(id, result.message);
  return problem === undefined ? result : { ...result, problem };
}

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
  /** Loads a tool's sidebar section fresh, by MCP server name; `undefined` when no section uses it. */
  loadWidget: (id: ConnectionId) => Promise<WidgetResult | undefined>;
  /** The sidebar's latest result for a tool, without loading anything. */
  cachedWidget: (id: ConnectionId) => Promise<WidgetResult | undefined>;
  /** Where KakaoTalk's and YouTube Music's sign-ins stand, read from this Mac without calling out. */
  accounts: () => Promise<SettingsView["accounts"]>;
};

const NO_ACCOUNTS: SettingsView["accounts"] = { kakaotalk: "unconfigured", youtube_music: "unconfigured" };

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

  async #test(id: ConnectionId): Promise<ConnectionTest> {
    const result = await this.#deps.loadWidget(id);
    if (result === undefined) return { ok: false, message: `No sidebar section uses ${id}; add one to config/dashboard.yaml.` };
    return asTest(result);
  }

  async #lastTest(id: ConnectionId): Promise<ConnectionTest | undefined> {
    const result = await this.#deps.cachedWidget(id);
    return result === undefined ? undefined : asTest(result);
  }

  /**
   * ### update
   *
   * Saves a change to your choices; see {@link applySettingsPatch}.
   */
  async update(patch: SettingsPatch): Promise<void> {
    await updateSettings((current) => applySettingsPatch(current, patch));
  }

  /**
   * ### view
   *
   * @returns Readiness of agents and tools, each connection, and your profile.
   */
  async view(): Promise<SettingsView> {
    const [settings, mcp, sidebar, envFile, agents, github, docker, last, accounts] = await Promise.all([
      readSettings(),
      readMcpFile(),
      this.#deps.sidebar(),
      hasEnvFile(),
      this.#deps.agents(),
      this.#deps.tools.github(),
      this.#deps.tools.docker(),
      Promise.all(CONNECTIONS.map((id) => this.#lastTest(id).catch(() => undefined))),
      // Their own cards show their errors; an unreadable file there must not blank all of Settings.
      this.#deps.accounts().catch(() => NO_ACCOUNTS),
    ]);

    const connections = CONNECTIONS.map((id, index): ConnectionView => {
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
        ...(id === "google_calendar" ? { signedIn: googleSignedIn() } : {}),
        ...(last[index] === undefined ? {} : { last: withProblem(id, last[index]) }),
      };
    });

    return {
      setupNeeded: !settings.setupDone && !envFile,
      customConfig: mcp.custom ? mcp.file : undefined,
      agents,
      tools: { github, docker },
      connections,
      accounts,
      agentSecrets: [secret("ANTHROPIC_API_KEY"), secret("OPENAI_API_KEY")],
      profile: sidebar.profile,
      defaultFolder: { chosen: settings.defaultFolder, fallback: workspaceDir() },
      lead: savedLead(settings),
      inbox: settings.inbox,
      meetings: settings.meetings,
      developer: {
        enabled: settings.developer.enabled,
        sourceFolder: settings.developer.sourceFolder ?? runningCheckout(),
        chosen: settings.developer.sourceFolder !== undefined,
      },
    };
  }

  /**
   * ### test
   *
   * Loads the tool's sidebar section fresh, the same way the sidebar does.
   *
   * @returns How many items came back and who the token belongs to, or why it failed.
   */
  async test(id: ConnectionId): Promise<ConnectionTest> {
    const [result, who] = await Promise.all([this.#test(id), whoAmI(id)]);
    if (!result.ok) return withProblem(id, result);
    return who === undefined ? result : { ...result, who };
  }
}
