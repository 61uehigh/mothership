import { Codex, type ThreadItem } from "@openai/codex-sdk";
import { clipToolOutput, type AgentEvent } from "@/features/sessions/model/AgentEvents";
import { type AgentAdapter, type AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import type { McpServer } from "@/platform/mcp/McpRegistry";
import { codexExecutable } from "@/platform/agentBinaries";

type CodexConfig = NonNullable<NonNullable<ConstructorParameters<typeof Codex>[0]>["config"]>;

/**
 * Every server here was given to the agent on purpose (its own mothership tools, and the
 * tools chosen for the session), and no human is attached to approve each call; with
 * the approval policy "never", Codex would otherwise reject every MCP tool call.
 */
const TOOLS_APPROVED = { default_tools_approval_mode: "approve" } as const;

/** Server settings that are not secret and may stay on the command line. */
const PLAIN_ENV = new Set(["MOTHERSHIP_URL", "MOTHERSHIP_PROVIDERS", "MOTHERSHIP_EFFORTS", "ELECTRON_RUN_AS_NODE"]);

/**
 * The agent's MCP servers as Codex config, with every secret kept off the
 * command line. The SDK turns config into `--config` arguments, which any
 * process on this Mac can read with `ps`; secret values go into the Codex
 * process's environment instead, and the config only names them: `env_vars`
 * forwards a variable to a stdio server, `env_http_headers` reads a header
 * from one. Codex keeps variables named like `*TOKEN*` or `*SECRET*` out of
 * the agent's shell commands.
 *
 * @returns The config, and the variables to add to the Codex process.
 */
function toCodexSetup(servers: Array<McpServer>): { config: CodexConfig; secrets: Record<string, string> } {
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
    for (const [name, value] of Object.entries(server.env)) {
      // A variable is forwarded by its own name; if two servers need different values under
      // one name, the second keeps its value in the config rather than getting the wrong one.
      if (PLAIN_ENV.has(name) || (secrets[name] !== undefined && secrets[name] !== value)) {
        plain[name] = value;
        continue;
      }
      secrets[name] = value;
      forwarded.push(name);
    }
    mcp[server.name] = { command: server.command, args: server.args, env: plain, env_vars: forwarded, ...TOOLS_APPROVED };
  });
  return { config: { mcp_servers: mcp }, secrets };
}

/** This process's environment plus `extra`; giving the SDK an environment replaces the inherited one. */
function codexEnv(extra: Record<string, string>): Record<string, string> {
  const inherited = Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return { ...Object.fromEntries(inherited), ...extra };
}

function describeItem(item: ThreadItem): AgentEvent | undefined {
  switch (item.type) {
    case "agent_message":
      return { type: "text", text: item.text };
    case "command_execution":
      return {
        type: "tool",
        name: "shell",
        detail: item.command,
        id: item.id,
        result: { output: clipToolOutput(item.aggregated_output), failed: item.exit_code !== undefined && item.exit_code !== 0 },
      };
    case "file_change":
      return {
        type: "tool",
        name: "patch",
        detail: item.changes.map((c) => `${c.kind} ${c.path}`).join(", "),
        id: item.id,
        result: { output: item.status === "failed" ? "The patch could not be applied" : "", failed: item.status === "failed" },
      };
    case "mcp_tool_call":
      return {
        type: "tool",
        name: `${item.server}.${item.tool}`,
        detail: JSON.stringify(item.arguments),
        id: item.id,
        result:
          // Typed as optional, but Codex sends `null` for no error.
          item.error?.message !== undefined
            ? { output: clipToolOutput(item.error.message), failed: true }
            : {
                output: clipToolOutput(
                  (item.result?.content ?? []).map((block) => ("text" in block && typeof block.text === "string" ? block.text : "")).join("\n"),
                ),
                failed: false,
              },
      };
    case "web_search":
      return { type: "tool", name: "web_search", detail: item.query };
    case "error":
      return { type: "text", text: `⚠ ${item.message}` };
    default:
      return undefined;
  }
}

async function* turn(request: AgentRequest): AsyncGenerator<AgentEvent> {
  const { config, secrets } = toCodexSetup(request.mcpServers);
  const codex = new Codex({ ...codexExecutable(), config, env: codexEnv(secrets) });
  const options = {
    model: request.model,
    modelReasoningEffort: request.effort,
    workingDirectory: request.workingDirectory,
    skipGitRepoCheck: true,
    // Writes stay inside the working directory; no approval prompts since no human is attached.
    sandboxMode: "workspace-write" as const,
    approvalPolicy: "never" as const,
  };
  const thread =
    request.sessionRef === undefined
      ? codex.startThread(options)
      : codex.resumeThread(request.sessionRef, options);

  const { events } = await thread.runStreamed(request.prompt, { signal: request.signal });
  let finalResponse = "";

  for await (const event of events) {
    if (event.type === "thread.started") {
      yield { type: "session", ref: event.thread_id };
    } else if (event.type === "item.completed") {
      if (event.item.type === "agent_message") finalResponse = event.item.text;
      const described = describeItem(event.item);
      if (described !== undefined) yield described;
    } else if (event.type === "turn.completed") {
      yield { type: "done", output: finalResponse, costUsd: undefined };
      return;
    } else if (event.type === "turn.failed") {
      yield { type: "error", message: event.error.message };
      return;
    } else if (event.type === "error") {
      yield { type: "error", message: event.message };
      return;
    }
  }
  if (!request.signal.aborted) yield { type: "error", message: "Codex stream ended without completing the turn" };
}

// The SDK throws when the CLI fails to start, exits abnormally, or is
// aborted; the adapter contract turns those into events.
async function* run(request: AgentRequest): AsyncGenerator<AgentEvent> {
  try {
    yield* turn(request);
  } catch (error) {
    if (request.signal.aborted) return;
    yield { type: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * ### codexAdapter
 *
 * Drives the Codex CLI through `@openai/codex-sdk`. Authenticates with
 * `OPENAI_API_KEY`, or with a ChatGPT login made via `pnpm exec codex login`.
 */
export const codexAdapter: AgentAdapter = { kind: "codex", run };
