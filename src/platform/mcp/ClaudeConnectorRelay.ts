import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { connectorServerName } from "@/platform/mcp/McpRegistry";
import type { CallOptions, ToolCaller } from "@/platform/mcp/ToolCaller";
import { claudeExecutable } from "@/platform/agentBinaries";

const RELAY_MODEL = "haiku";
const RELAY_TIMEOUT_MS = 45_000;
const MAX_CONCURRENT = 2;

const SYSTEM_PROMPT =
  "You are a tool-calling relay. Make exactly the one tool call the user requests, with exactly the arguments given. " +
  "Do not change, add, or drop arguments. Do not add commentary.";

/**
 * ### ConnectorRelayError
 *
 * The relay could not get a tool result from a claude.ai connector. The
 * message is shown to the user as-is.
 */
export class ConnectorRelayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConnectorRelayError";
  }
}

/**
 * ### connectorToolName
 *
 * Claude Code exposes the claude.ai connector "Google Calendar" as the MCP
 * server `claude_ai_Google_Calendar`.
 *
 * @returns The fully qualified tool name an agent session uses.
 */
function connectorToolName(connector: string, tool: string): string {
  return `mcp__${connectorServerName(connector)}__${tool}`;
}

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  // Given up on while queued: hand the slot on without spending any usage.
  if (signal?.aborted === true) {
    waiting.shift()?.();
    throw new ConnectorRelayError("The call was cancelled before it started");
  }
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: unknown) =>
      typeof block === "object" && block !== null && "text" in block && typeof block.text === "string" ? block.text : "",
    )
    .join("");
}

/**
 * ### RelayHooks
 *
 * What a relay caller wants to hear about besides the result.
 */
export type RelayHooks = {
  /** Claude's current usage limits, reported by each relay session. */
  onRateLimit?: (info: unknown) => void;
};

async function relay(connector: string, tool: string, args: Record<string, unknown>, options: CallOptions, hooks: RelayHooks): Promise<string> {
  const fullName = connectorToolName(connector, tool);
  const abortController = new AbortController();
  // The clock starts once this call has a slot, not while it waits for one.
  const timer = setTimeout(() => abortController.abort(), RELAY_TIMEOUT_MS);
  const cancel = () => abortController.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  // Connectors exist only under a claude.ai login, so never authenticate the relay with an API key.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  let toolUseId: string | undefined;
  let called = false;
  try {
    const stream = query({
      prompt: `Call ${fullName} exactly once with exactly these arguments, then stop:\n${JSON.stringify(args)}`,
      options: {
        ...claudeExecutable(),
        model: RELAY_MODEL,
        systemPrompt: SYSTEM_PROMPT,
        // An empty directory: no project CLAUDE.md or settings leak into the relay.
        cwd: tmpdir(),
        env,
        maxTurns: 3,
        // Every tool call goes through canUseTool, which allows only the requested
        // tool and replaces whatever arguments the model wrote with the exact ones
        // given. Text inside a message or a search query therefore cannot steer
        // the call to another channel, event, or tool.
        permissionMode: "default",
        // Exactly one call: a second one (parallel, or in a later turn) could send a message twice.
        canUseTool: async (name) => {
          if (name !== fullName) return { behavior: "deny", message: `Only ${fullName} may be called` };
          if (called) return { behavior: "deny", message: `${fullName} was already called once; stop now` };
          called = true;
          return { behavior: "allow", updatedInput: args };
        },
        abortController,
      },
    });
    for await (const message of stream) {
      if (message.type === "rate_limit_event") {
        hooks.onRateLimit?.(message.rate_limit_info);
      } else if (message.type === "assistant") {
        for (const block of message.message.content) {
          // The first call is the one that runs; later ones are denied.
          if (block.type === "tool_use" && block.name === fullName) toolUseId ??= block.id;
        }
      } else if (message.type === "user" && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type !== "tool_result" || block.tool_use_id !== toolUseId) continue;
          const text = resultText(block.content);
          if (block.is_error === true) throw new ConnectorRelayError(`claude.ai ${connector} ${tool} failed: ${text.slice(0, 300)}`);
          // The result is all we need; stopping here skips the model's closing turn.
          abortController.abort();
          return text;
        }
      }
    }
  } catch (error) {
    if (error instanceof ConnectorRelayError) throw error;
    if (!abortController.signal.aborted) {
      throw new ConnectorRelayError(`claude.ai ${connector} relay failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
  if (options.signal?.aborted === true) throw new ConnectorRelayError(`The claude.ai ${connector} call was cancelled`);
  throw new ConnectorRelayError(
    toolUseId === undefined
      ? `Could not use the claude.ai ${connector} connector. Check that the ${connector} connector is connected in your claude.ai settings.`
      : // The tool was called; for a send or a reply it may have gone through even without an answer.
        `claude.ai ${connector} did not answer within ${RELAY_TIMEOUT_MS / 1000} seconds. ${tool} may still have gone through, so check before trying again.`,
  );
}

/**
 * ### connectorCaller
 *
 * Calls tools of a claude.ai connector (e.g. "Slack") that is already
 * connected to the user's Claude account, by having a minimal Haiku session
 * make the one call and returning the raw tool result. Each call starts a
 * short Claude session and uses a small amount of Claude usage (about
 * $0.007 measured), so callers should cache results.
 *
 * Requires being logged in with `claude` (not an API key). Tool
 * descriptions are not available through the relay.
 *
 * @param hooks - Optional listeners, e.g. for usage limits.
 * @returns A {@link ToolCaller} for the connector.
 */
export function connectorCaller(connector: string, hooks: RelayHooks = {}): ToolCaller {
  return {
    label: `connector:${connector}`,
    callText: (tool, args, options = {}) => withSlot(() => relay(connector, tool, args, options, hooks), options.signal),
    describe: async () => undefined,
  };
}
