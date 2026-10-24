import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServer } from "@/platform/mcp/McpRegistry";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { CallOptions, ToolCaller } from "@/platform/mcp/ToolCaller";

const CALL_TIMEOUT_MS = 20_000;

type Entry = { key: string; client: Promise<Client> };

/**
 * ### McpCallError
 *
 * A tool call that reached the server but failed, or a connection failure.
 * The message is shown to the user as-is.
 */
export class McpCallError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "McpCallError";
  }
}

function transportFor(server: McpServer) {
  if (server.transport === "http") {
    return new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } });
  }
  return new StdioClientTransport({
    command: server.command,
    args: server.args,
    // The SDK's default env keeps PATH and HOME so `npx` and similar launchers work.
    env: { ...getDefaultEnvironment(), ...server.env },
    stderr: "ignore",
  });
}

/**
 * ### McpClientPool
 *
 * Long-lived MCP client connections the server itself uses (the dashboard and
 * search), separate from the connections each agent opens. A connection is
 * reused until its config changes or a call fails.
 */
export class McpClientPool {
  readonly #entries = new Map<string, Entry>();

  async #client(server: McpServer): Promise<Client> {
    const key = JSON.stringify(server);
    const existing = this.#entries.get(server.name);
    if (existing !== undefined && existing.key === key) return existing.client;
    if (existing !== undefined) void this.#close(server.name);

    const client = (async () => {
      const instance = new Client({ name: "mothership", version: "0.1.0" });
      await instance.connect(transportFor(server));
      return instance;
    })();
    this.#entries.set(server.name, { key, client });
    // Drop failed connections so the next call retries from scratch (unless a newer one replaced it).
    client.catch(() => {
      if (this.#entries.get(server.name)?.client === client) this.#entries.delete(server.name);
    });
    return client;
  }

  /**
   * Closes the connection for `name`; with `only`, just when that is still the
   * current connection, so a failure on an old one never closes a fresh one.
   */
  async #close(name: string, only?: Promise<Client>): Promise<void> {
    const entry = this.#entries.get(name);
    if (only !== undefined && entry?.client !== only) return;
    this.#entries.delete(name);
    await entry?.client.then((c) => c.close()).catch(() => {
      // Closing a broken connection can fail; it is being discarded either way.
    });
  }

  /**
   * ### retain
   *
   * Closes connections to servers that are no longer in use (turned off,
   * removed, or switched to a claude.ai connector), so their processes exit.
   *
   * @param names - Servers still in use.
   */
  async retain(names: ReadonlySet<string>): Promise<void> {
    await Promise.all([...this.#entries.keys()].filter((name) => !names.has(name)).map((name) => this.#close(name)));
  }

  /**
   * ### caller
   *
   * @returns A {@link ToolCaller} bound to one server.
   */
  caller(server: McpServer): ToolCaller {
    return {
      label: `mcp:${server.name}`,
      callText: (tool, args, options) => this.callText(server, tool, args, options),
      describe: (tool) => this.toolDescription(server, tool),
    };
  }

  /**
   * ### callText
   *
   * Calls a tool and joins its text content blocks.
   *
   * @param server - Resolved server from `loadMcpConfig`.
   * @param tool - Tool name as the server lists it.
   * @param args - Tool arguments.
   * @returns The concatenated text output.
   * @throws {@link McpCallError} On connection failure, timeout, or a tool-reported error.
   */
  async callText(server: McpServer, tool: string, args: Record<string, unknown>, options?: CallOptions): Promise<string> {
    let result;
    const pending = this.#client(server);
    try {
      const client = await pending;
      result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS, signal: options?.signal });
    } catch (error) {
      // A call the caller gave up on says nothing about the connection.
      if (options?.signal?.aborted === true) throw new McpCallError(`${server.name} call was cancelled`, { cause: error });
      throw this.#failure(server, pending, error);
    }
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((block: unknown) =>
        typeof block === "object" && block !== null && "text" in block && typeof block.text === "string" ? block.text : "",
      )
      .join("\n");
    if (result.isError === true) throw new McpCallError(`${server.name}.${tool} failed: ${text.slice(0, 300)}`);
    return text;
  }

  /**
   * ### toolDescription
   *
   * @returns The description of one tool, or `undefined` if the server does not list it.
   * @throws {@link McpCallError} On connection failure.
   */
  async toolDescription(server: McpServer, tool: string): Promise<string | undefined> {
    const pending = this.#client(server);
    try {
      const client = await pending;
      const { tools } = await client.listTools(undefined, { timeout: CALL_TIMEOUT_MS });
      return tools.find((t) => t.name === tool)?.description;
    } catch (error) {
      throw this.#failure(server, pending, error);
    }
  }

  /**
   * Turns a failed call into a user-facing error. Timeouts and protocol
   * errors leave the connection alone (other calls may be using it); only a
   * broken connection is closed so the next call reconnects.
   */
  #failure(server: McpServer, client: Promise<Client>, error: unknown): McpCallError {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof McpError && error.code !== ErrorCode.ConnectionClosed) {
      return new McpCallError(
        error.code === ErrorCode.RequestTimeout ? `${server.name} did not answer in time` : `${server.name} rejected the call: ${detail}`,
        { cause: error },
      );
    }
    void this.#close(server.name, client);
    return new McpCallError(`Could not connect to ${server.name}: ${detail}`, { cause: error });
  }
}
