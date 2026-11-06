import { describe, expect, it } from "vitest";
import { resolveMcpConfig, type McpFile } from "@/platform/mcp/mcpConfig";

type Servers = McpFile["config"]["servers"];

const FILE = "/home/ada/config/mcp.yaml";
const ROOT = "/Applications/mothership";

function resolve(servers: Servers, { env = {}, choices = {}, claudeConnectors = {} }: { env?: Record<string, string>; choices?: Parameters<typeof resolveMcpConfig>[1]; claudeConnectors?: Record<string, string> } = {}) {
  return resolveMcpConfig({ file: FILE, config: { servers, claudeConnectors } }, choices, { env, root: ROOT });
}

const linear: Servers[string] = { transport: "http", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer ${LINEAR_API_KEY}" }, enabled: true };
const nuclino: Servers[string] = { transport: "stdio", command: "node", args: ["${APP_ROOT}/scripts/nuclino.mjs"], env: { NUCLINO_API_KEY: "${NUCLINO_API_KEY}" }, enabled: true };

describe("resolveMcpConfig", () => {
  it("fills ${VAR} placeholders from the environment and ${APP_ROOT} with the app's root", () => {
    const { servers, unavailable } = resolve({ linear, nuclino }, { env: { LINEAR_API_KEY: "lin_1", NUCLINO_API_KEY: "nuc_1" } });
    expect(unavailable).toEqual([]);
    expect(servers).toEqual([
      { name: "linear", transport: "http", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer lin_1" } },
      { name: "nuclino", transport: "stdio", command: "node", args: ["/Applications/mothership/scripts/nuclino.mjs"], env: { NUCLINO_API_KEY: "nuc_1" } },
    ]);
  });

  it("makes a server reading an unset or empty variable unavailable without blocking the others", () => {
    const { servers, unavailable } = resolve({ linear, nuclino }, { env: { LINEAR_API_KEY: "", NUCLINO_API_KEY: "nuc_1" } });
    expect(servers.map((s) => s.name)).toEqual(["nuclino"]);
    expect(unavailable).toEqual([{ name: "linear", reason: { code: "env-missing", variable: "LINEAR_API_KEY" } }]);
  });

  it("lets a Settings choice win over enabled in the file", () => {
    const env = { LINEAR_API_KEY: "lin_1", NUCLINO_API_KEY: "nuc_1" };
    const { servers, unavailable } = resolve({ linear: { ...linear, enabled: false }, nuclino }, { env, choices: { linear: "mcp", nuclino: "claude" } });
    expect(servers.map((s) => s.name)).toEqual(["linear"]);
    expect(unavailable).toEqual([{ name: "nuclino", reason: { code: "off-in-settings" } }]);
  });

  it("names the file when enabled: false turns a server off and Settings makes no choice", () => {
    expect(resolve({ linear: { ...linear, enabled: false } }).unavailable).toEqual([{ name: "linear", reason: { code: "disabled-in-file", file: FILE } }]);
  });

  it("keeps a claude.ai connector only for a server that is not in use and not turned off", () => {
    const claudeConnectors = { linear: "Linear", nuclino: "Nuclino", notion: "Notion" };
    const { claudeConnectors: connectors } = resolve({ linear, nuclino }, { env: { LINEAR_API_KEY: "lin_1" }, choices: { notion: "off" }, claudeConnectors });
    expect([...connectors]).toEqual([["nuclino", "Nuclino"]]);
  });
});
