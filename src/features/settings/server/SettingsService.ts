import { envReferences, readMcpFile } from "@/platform/mcp/mcpConfig";
import { runningCheckout } from "@/platform/checkout";
import { workspaceDir } from "@/platform/paths";
import {
  CONNECTION_KINDS,
  CONNECTIONS,
  type CheckResult,
  type ConnectionId,
  type ConnectionTest,
  type ConnectionView,
  type SettingsPatch,
  type SettingsView,
  type SidebarState,
} from "@/features/settings/model/Settings";
import { diagnoseConnection } from "@/features/settings/model/connectionDiagnosis";
import { availableModes, modeFromFiles } from "@/features/settings/model/connectionStatus";
import type { WidgetResult } from "@/features/tools/model/Dashboard";
import { hasEnvFile } from "@/features/settings/server/envFile";
import { googleSignedIn, oauthClientProblem } from "@/features/settings/server/googleOAuthClient";
import { whoAmI } from "@/features/settings/server/whoAmI";
import { applySettingsPatch, readSettings, savedLead, updateSettings } from "@/features/settings/server/settingsFile";
import { hasEnvSecret } from "@/platform/envSecret";

const secret = (name: string) => {
  const problem = name === "GOOGLE_OAUTH_CREDENTIALS" ? oauthClientProblem() : undefined;
  return { name, set: hasEnvSecret(name), ...(problem === undefined ? {} : { problem }) };
};

/** A sidebar section's result, as a connection test reads it; a failure mothership recognized is diagnosed from its code. */
function asTest(id: ConnectionId, result: WidgetResult): ConnectionTest {
  switch (result.status) {
    case "ok":
      return { ok: true, items: result.items.length };
    case "unavailable":
      return { ok: false, unavailable: result.reason };
    case "error": {
      const problem = result.code === undefined ? undefined : diagnoseConnection(id, result.message, result);
      return { ok: false, message: result.message, ...(problem === undefined ? {} : { problem }) };
    }
  }
}

/** Adds what the failure means, so the card can say what to do. */
function withProblem(id: ConnectionId, result: ConnectionTest): ConnectionTest {
  if (result.ok || result.problem !== undefined || result.message === undefined) return result;
  const problem = diagnoseConnection(id, result.message);
  return problem === undefined ? result : { ...result, problem };
}

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
  /** Where YouTube Music's and Gmail's sign-ins stand, read from this computer without calling out. */
  accounts: () => Promise<SettingsView["accounts"]>;
  /** Clears the sessions' suggested next prompts, once prompt suggestions are turned off. */
  clearSuggestions: () => void;
};

const NO_ACCOUNTS: SettingsView["accounts"] = { youtube_music: "unconfigured", gmail: "unconfigured" };

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
    if (result === undefined) return { ok: false, unavailable: { code: "no-widget", kind: CONNECTION_KINDS[id] } };
    return asTest(id, result);
  }

  async #lastTest(id: ConnectionId): Promise<ConnectionTest | undefined> {
    const result = await this.#deps.cachedWidget(id);
    return result === undefined ? undefined : asTest(id, result);
  }

  /**
   * ### update
   *
   * Saves a change to your choices; see {@link applySettingsPatch}.
   */
  async update(patch: SettingsPatch): Promise<void> {
    await updateSettings((current) => applySettingsPatch(current, patch));
    // Suggestions are stored on the sessions and outlive the setting, so turning it off takes them away too.
    if (patch.promptSuggestions === false) this.#deps.clearSuggestions();
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
      const files = { widget, server, hasConnector: connector !== undefined };
      return {
        id,
        mode: chosen ?? modeFromFiles(files),
        chosen: chosen !== undefined,
        modes: availableModes(files),
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
      timezone: { chosen: settings.timezone, ...sidebar.timezone },
      defaultFolder: { chosen: settings.defaultFolder, fallback: workspaceDir() },
      lead: savedLead(settings),
      autoContinue: settings.autoContinue,
      promptSuggestions: settings.promptSuggestions,
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
