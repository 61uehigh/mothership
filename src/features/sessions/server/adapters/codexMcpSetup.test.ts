import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { toCodexSetup } from "@/features/sessions/server/adapters/codexMcpSetup";
import type { McpServer } from "@/platform/mcp/mcpConfig";

function stdio(name: string, env: Record<string, string>): McpServer {
  return { name, transport: "stdio", command: "node", args: ["server.js"], env };
}

const run = promisify(execFile);

/** Everything the SDK would put on the Codex command line. */
function commandLine(servers: Array<McpServer>): string {
  return JSON.stringify(toCodexSetup(servers).config);
}

describe("toCodexSetup", () => {
  it("keeps an HTTP server's header values off the command line and names them instead", () => {
    const { config, secrets } = toCodexSetup([
      { name: "a", transport: "http", url: "https://a.example/mcp", headers: { Authorization: "Bearer sk-a" } },
      { name: "b", transport: "http", url: "https://b.example/mcp", headers: { Authorization: "Bearer sk-b" } },
    ]);
    expect(JSON.stringify(config)).not.toContain("sk-");
    const servers = config.mcp_servers as Record<string, { env_http_headers: Record<string, string> }>;
    const nameA = servers.a?.env_http_headers.Authorization ?? "";
    const nameB = servers.b?.env_http_headers.Authorization ?? "";
    expect(nameA).not.toBe(nameB);
    expect(secrets[nameA]).toBe("Bearer sk-a");
    expect(secrets[nameB]).toBe("Bearer sk-b");
  });

  it("forwards a stdio server's variables by name instead of writing their values", () => {
    const { config, secrets } = toCodexSetup([stdio("linear", { LINEAR_TOKEN: "lin-secret" })]);
    expect(JSON.stringify(config)).not.toContain("lin-secret");
    expect(config.mcp_servers).toMatchObject({ linear: { env: {}, env_vars: ["LINEAR_TOKEN"] } });
    expect(secrets).toEqual({ LINEAR_TOKEN: "lin-secret" });
  });

  it("keeps a secret shared by two servers under one name off the command line for both", () => {
    const servers = [stdio("one", { SHARED_TOKEN: "same-secret" }), stdio("two", { SHARED_TOKEN: "same-secret" })];
    expect(commandLine(servers)).not.toContain("same-secret");
    expect(toCodexSetup(servers).config.mcp_servers).toMatchObject({
      one: { env_vars: ["SHARED_TOKEN"] },
      two: { env_vars: ["SHARED_TOKEN"] },
    });
  });

  it("keeps a second value for a shared variable name off the command line", () => {
    const servers = [stdio("one", { API_KEY: "first" }), stdio("two", { API_KEY: "second" })];
    expect(commandLine(servers)).not.toContain("second");
    const { config, secrets } = toCodexSetup(servers, { path: "/node" });
    expect(secrets).toEqual({ API_KEY: "first", MOTHERSHIP_MCP_SECRET_1_API_KEY: "second" });
    expect(config.mcp_servers).toMatchObject({
      one: { command: "node", env_vars: ["API_KEY"] },
      two: { command: "/node", env: { MOTHERSHIP_ENV_RENAMES: "API_KEY=MOTHERSHIP_MCP_SECRET_1_API_KEY" }, env_vars: ["MOTHERSHIP_MCP_SECRET_1_API_KEY"] },
    });
  });

  it("starts a server under a shared variable name with its own value", async () => {
    const { config, secrets } = toCodexSetup([stdio("one", { API_KEY: "first" }), stdio("two", { API_KEY: "second" })], { path: process.execPath });
    const two = (config.mcp_servers as Record<string, { command: string; args: Array<string>; env: Record<string, string>; env_vars: Array<string> }>).two;
    // What Codex does: the server's `env`, plus each `env_vars` name taken from Codex's own environment.
    const env = { NODE_ENV: "test" as const, PATH: process.env.PATH ?? "", ...two.env, ...Object.fromEntries(two.env_vars.map((name) => [name, secrets[name]])) };
    const end = two.args.indexOf("--") + 1;
    expect(two.args.slice(end)).toEqual(["node", "server.js"]);
    // Swap the server for one that reports what it was given.
    const print = "process.stdout.write(JSON.stringify({ key: process.env.API_KEY, source: process.env.MOTHERSHIP_MCP_SECRET_1_API_KEY ?? null, renames: process.env.MOTHERSHIP_ENV_RENAMES ?? null }))";
    const args = [...two.args.slice(0, end), process.execPath, "-e", print];
    const { stdout } = await run(two.command, args, { env });
    expect(JSON.parse(stdout)).toEqual({ key: "second", source: null, renames: null });
  });

  it("leaves mothership's own non-secret settings on the command line", () => {
    const { config, secrets } = toCodexSetup([stdio("mothership", { MOTHERSHIP_URL: "http://127.0.0.1:3000", MOTHERSHIP_TOKEN: "t" })]);
    expect(config.mcp_servers).toMatchObject({ mothership: { env: { MOTHERSHIP_URL: "http://127.0.0.1:3000" }, env_vars: ["MOTHERSHIP_TOKEN"] } });
    expect(secrets).toEqual({ MOTHERSHIP_TOKEN: "t" });
  });
});
