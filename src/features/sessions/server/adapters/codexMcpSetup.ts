import type { Codex } from "@openai/codex-sdk";
import type { McpServer } from "@/platform/mcp/mcpConfig";

/**
 * ### CodexConfig
 *
 * The `config` the Codex SDK turns into `--config` arguments.
 */
export type CodexConfig = NonNullable<NonNullable<ConstructorParameters<typeof Codex>[0]>["config"]>;

/**
 * Every server here was given to the agent on purpose (its own mothership tools, and the
 * tools chosen for the session), and no human is attached to approve each call; with
 * the approval policy "never", Codex would otherwise reject every MCP tool call.
 */
const TOOLS_APPROVED = { default_tools_approval_mode: "approve" } as const;

/** Server settings that are not secret and may stay on the command line. */
const PLAIN_ENV = new Set(["MOTHERSHIP_URL", "MOTHERSHIP_PROVIDERS", "MOTHERSHIP_EFFORTS", "ELECTRON_RUN_AS_NODE"]);

/** Names the variables {@link RENAME_LAUNCHER} copies, as `TARGET=SOURCE` pairs joined by commas. */
const RENAMES_VARIABLE = "MOTHERSHIP_ENV_RENAMES";

/**
 * ### RENAME_LAUNCHER
 *
 * A Node script (run with `node -e`) that starts a stdio MCP server after
 * copying each variable named in {@link RENAMES_VARIABLE} to the name the
 * server reads, then removing the source. Codex forwards a variable only under
 * its own name, so this is how a server gets a secret under a name another
 * server already uses, without the value reaching the command line. The
 * script holds no secret; it is single-quoted only, so it survives Codex's
 * config quoting.
 */
export const RENAME_LAUNCHER = [
  "const { spawn } = require('node:child_process');",
  `const pairs = (process.env.${RENAMES_VARIABLE} || '').split(',').filter(Boolean);`,
  `delete process.env.${RENAMES_VARIABLE};`,
  "for (const pair of pairs) { const [to, from] = pair.split('='); process.env[to] = process.env[from]; delete process.env[from]; }",
  "if (process.env.MOTHERSHIP_KEEP_ELECTRON_NODE !== '1') delete process.env.ELECTRON_RUN_AS_NODE;",
  "delete process.env.MOTHERSHIP_KEEP_ELECTRON_NODE;",
  "const [command, ...args] = process.argv.slice(1);",
  // Windows finds `npx` and other `.cmd` launchers only through the shell.
  "const windows = process.platform === 'win32';",
  "const quote = (a) => windows ? JSON.stringify(a) : a;",
  "const child = spawn(quote(command), args.map(quote), { stdio: 'inherit', shell: windows });",
  "for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));",
  "child.on('error', (error) => { console.error(error.message); process.exit(127); });",
  "child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));",
].join(" ");

/**
 * ### NodeRuntime
 *
 * The Node that runs {@link RENAME_LAUNCHER}: this server's own executable,
 * which in the desktop app is Electron run as Node.
 */
export type NodeRuntime = { path: string };

/**
 * ### toCodexSetup
 *
 * The agent's MCP servers as Codex config, with every secret kept off the
 * command line. The SDK turns config into `--config` arguments, which any
 * process on this Mac can read with `ps`; secret values go into the Codex
 * process's environment instead, and the config only names them: `env_vars`
 * forwards a variable to a stdio server, `env_http_headers` reads a header
 * from one. Codex keeps variables named like `*TOKEN*` or `*SECRET*` out of
 * the agent's shell commands. When two stdio servers need different values
 * under one name, the second gets its value under a name of its own and is
 * started through {@link RENAME_LAUNCHER}, which puts it back under the name
 * the server reads.
 *
 * @param node - The Node that runs the launcher; this process's own by default.
 * @returns The config, and the variables to add to the Codex process.
 */
export function toCodexSetup(
  servers: Array<McpServer>,
  node: NodeRuntime = { path: process.execPath },
): { config: CodexConfig; secrets: Record<string, string> } {
  const secrets: Record<string, string> = {};
  const mcp: Record<string, CodexConfig> = {};
  servers.forEach((server, i) => {
    if (server.transport === "http") {
      const headers = Object.fromEntries(
        Object.entries(server.headers).map(([header, value], j) => {
          const name = `MOTHERSHIP_MCP_SECRET_${i}_${j}`;
          secrets[name] = value;
          return [header, name];
        }),
      );
      mcp[server.name] = { url: server.url, env_http_headers: headers, ...TOOLS_APPROVED };
      return;
    }
    const plain: Record<string, string> = {};
    const forwarded: Array<string> = [];
    const renames: Array<string> = [];
    for (const [name, value] of Object.entries(server.env)) {
      if (PLAIN_ENV.has(name)) {
        plain[name] = value;
        continue;
      }
      const forwardedName = secrets[name] === undefined || secrets[name] === value ? name : `MOTHERSHIP_MCP_SECRET_${i}_${name}`;
      if (forwardedName !== name) renames.push(`${name}=${forwardedName}`);
      secrets[forwardedName] = value;
      forwarded.push(forwardedName);
    }
    if (renames.length === 0) {
      mcp[server.name] = { command: server.command, args: server.args, env: plain, env_vars: forwarded, ...TOOLS_APPROVED };
      return;
    }
    mcp[server.name] = {
      command: node.path,
      args: ["-e", RENAME_LAUNCHER, "--", server.command, ...server.args],
      env: {
        ...plain,
        [RENAMES_VARIABLE]: renames.join(","),
        ELECTRON_RUN_AS_NODE: "1",
        ...(plain.ELECTRON_RUN_AS_NODE === undefined ? {} : { MOTHERSHIP_KEEP_ELECTRON_NODE: "1" }),
      },
      env_vars: forwarded,
      ...TOOLS_APPROVED,
    };
  });
  return { config: { mcp_servers: mcp }, secrets };
}
