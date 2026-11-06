import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { appRoot, configPath } from "@/platform/paths";

const ENV_REFERENCE = /\$\{(\w+)\}/g;

const mcpServerSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("http"),
    url: z.url(),
    headers: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    transport: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
  }),
]);

const mcpConfigSchema = z.object({
  /**
   * mcp.yaml server name → claude.ai connector name. Claude agents use the
   * connector for a server that is not enabled here (no extra setup needed).
   */
  claudeConnectors: z.record(z.string(), z.string()).default({}),
  servers: z.record(
    z.string().regex(/^[a-z][a-z0-9_]*$/),
    mcpServerSchema.and(z.object({ enabled: z.boolean().default(true) })),
  ),
});

/**
 * ### McpServer
 *
 * A resolved MCP server entry: `${VAR}` placeholders are already replaced with
 * environment values, and disabled entries are filtered out.
 */
export type McpServer = { name: string } & z.infer<typeof mcpServerSchema>;

/**
 * ### MissingEnvError
 *
 * Thrown when `config/mcp.yaml` references an environment variable that is
 * not set. Carries the variable name so the UI can tell the user what to add.
 */
export class MissingEnvError extends Error {
  /** The unset variable, without the `${}` wrapper. */
  readonly variable: string;

  constructor(variable: string, server: string) {
    super(`MCP server "${server}" needs env var ${variable}; add it to .env.local`);
    this.name = "MissingEnvError";
    this.variable = variable;
  }
}

function interpolate(value: string, server: string): string {
  return value.replace(ENV_REFERENCE, (_, variable: string) => {
    // Built in: where the app's own files are, e.g. for a script that ships with it.
    if (variable === "APP_ROOT") return appRoot();
    const resolved = process.env[variable];
    if (resolved === undefined || resolved === "") {
      throw new MissingEnvError(variable, server);
    }
    return resolved;
  });
}

function interpolateRecord(record: Record<string, string>, server: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, interpolate(value, server)]),
  );
}

/**
 * ### UnavailableMcpServer
 *
 * A server listed in the config that cannot be used, with a human-readable
 * reason the UI can show as a setup hint.
 */
export type UnavailableMcpServer = { name: string; reason: string };

/**
 * ### McpConfig
 *
 * Result of {@link loadMcpConfig}.
 */
export type McpConfig = {
  /** Enabled servers with secrets resolved; safe to connect to. */
  servers: Array<McpServer>;
  /** Server name → claude.ai connector, for servers not enabled above. */
  claudeConnectors: Map<string, string>;
  /** Disabled servers and servers missing an environment variable. */
  unavailable: Array<UnavailableMcpServer>;
};

/**
 * ### McpChoices
 *
 * Per-server choices made in Settings, which win over `enabled` in the file:
 * `mcp` turns a server on, anything else turns it off, and `off` also drops
 * its claude.ai connector.
 */
export type McpChoices = Partial<Record<string, "mcp" | "claude" | "off">>;

/**
 * ### McpFile
 *
 * The MCP config file as written, before choices and `${VAR}` values apply.
 */
export type McpFile = {
  /** Absolute path of the file read. */
  file: string;
  /** Whether `MOTHERSHIP_MCP_CONFIG` points somewhere else (e.g. demo mode). */
  custom: boolean;
  config: z.infer<typeof mcpConfigSchema>;
};

/**
 * ### readMcpFile
 *
 * Reads `config/mcp.yaml`, or `MOTHERSHIP_MCP_CONFIG` when set (relative to
 * the project root), which lets the demo fixtures stand in for real tools.
 *
 * @returns The validated file.
 */
export async function readMcpFile(): Promise<McpFile> {
  // `||` on purpose: an empty MOTHERSHIP_MCP_CONFIG in .env.local means "use the default".
  const custom = process.env.MOTHERSHIP_MCP_CONFIG || undefined;
  const file = custom === undefined ? configPath("mcp.yaml") : path.resolve(appRoot(), custom);
  const raw: unknown = load(await readFile(file, "utf8"));
  return { file, custom: custom !== undefined, config: mcpConfigSchema.parse(raw) };
}

/**
 * ### envReferences
 *
 * @returns The `${VAR}` names a server entry reads, in order, without repeats.
 */
export function envReferences(server: McpFile["config"]["servers"][string]): Array<string> {
  const values = server.transport === "http" ? [server.url, ...Object.values(server.headers)] : [...server.args, ...Object.values(server.env)];
  return [...new Set(values.flatMap((value) => [...value.matchAll(ENV_REFERENCE)].map((m) => m[1])))];
}

/**
 * ### loadMcpConfig
 *
 * Reads the MCP config (see {@link readMcpFile}) fresh on every call so edits
 * apply without a restart. A misconfigured server never blocks the others.
 * The server's composition root passes your Settings choices.
 *
 * @param choices - Choices from Settings, by server name.
 * @returns Usable servers and the reasons the rest are unusable.
 */
export async function loadMcpConfig(choices: McpChoices = {}): Promise<McpConfig> {
  const { file, config } = await readMcpFile();

  const servers: Array<McpServer> = [];
  const unavailable: Array<UnavailableMcpServer> = [];
  for (const [name, server] of Object.entries(config.servers)) {
    const choice = choices[name];
    if (choice !== undefined ? choice !== "mcp" : !server.enabled) {
      const where = choice !== undefined ? "Settings" : `${file} (enabled: false)`;
      unavailable.push({ name, reason: `${name} is not set to use its MCP server in ${where}` });
      continue;
    }
    try {
      servers.push(
        server.transport === "http"
          ? {
              name,
              transport: "http",
              url: interpolate(server.url, name),
              headers: interpolateRecord(server.headers, name),
            }
          : {
              name,
              transport: "stdio",
              command: server.command,
              args: server.args.map((arg) => interpolate(arg, name)),
              env: interpolateRecord(server.env, name),
            },
      );
    } catch (error) {
      if (!(error instanceof MissingEnvError)) throw error;
      unavailable.push({ name, reason: `${error.variable} needs to be set in .env.local` });
    }
  }
  const claudeConnectors = new Map(
    Object.entries(config.claudeConnectors).filter(([name]) => !servers.some((s) => s.name === name) && choices[name] !== "off"),
  );
  return { servers, unavailable, claudeConnectors };
}

/**
 * ### connectorServerName
 *
 * Claude sessions expose the claude.ai connector "Google Calendar" as the MCP
 * server `claude_ai_Google_Calendar`.
 *
 * @returns The connector's MCP server name inside a Claude session.
 */
export function connectorServerName(connector: string): string {
  return `claude_ai_${connector.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
