import { tmpdir } from "node:os";
import { query, type SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";
import { connectorServerName } from "@/platform/mcp/mcpConfig";
import { ToolTimeoutError, type CallOptions, type ToolCaller } from "@/platform/mcp/ToolCaller";
import { claudeExecutable } from "@/platform/agentBinaries";
import { noteClaudeAuth } from "@/platform/claudeLogin";
import { relayEnding, type RelayRun } from "@/platform/mcp/relayEnding";
import {
  ConnectorClaudeError,
  ConnectorNotConnectedError,
  ConnectorRelayError,
  ConnectorToolError,
  RelayTimeoutError,
} from "@/platform/mcp/relayErrors";
import { errorMessage } from "@/lib/errors";
import { processState } from "@/platform/processState";

const RELAY_MODEL = "haiku";
const RELAY_TIMEOUT_MS = 45_000;
const MAX_CONCURRENT = 2;

const SYSTEM_PROMPT =
  "You are a tool-calling relay. Make exactly the one tool call the user requests, with exactly the arguments given. " +
  "Do not change, add, or drop arguments. Do not add commentary.";

// The Agent SDK wraps the CLI's error result in this prefix; the rest is Claude's own text.
const ERROR_RESULT_PREFIX = /^Claude Code returned an error result:\s*/i;

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

/** Relay calls running and waiting, shared by every route so the limit holds for the whole server. */
const slots = processState("mcp.connectorRelaySlots", () => ({ active: 0, waiting: new Array<() => void>() }));

async function withSlot<T>(task: () => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (slots.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => slots.waiting.push(resolve));
  // Given up on while queued: hand the slot on without spending any usage.
  if (signal?.aborted === true) {
    slots.waiting.shift()?.();
    throw new ConnectorRelayError("The call was cancelled before it started");
  }
  slots.active++;
  try {
    return await task();
  } finally {
    slots.active--;
    slots.waiting.shift()?.();
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
  let timedOut = false;
  // The clock starts once this call has a slot, not while it waits for one.
  const timer = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, RELAY_TIMEOUT_MS);
  const cancel = () => abortController.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  // Connectors exist only under a claude.ai login, so never authenticate the relay with an API key.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  let toolUseId: string | undefined;
  let called = false;
  let thrown: unknown;
  let errorResult: RelayRun["errorResult"];
  let assistantError: SDKAssistantMessageError | undefined;
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
      } else if (message.type === "result") {
        if (message.subtype !== "success") errorResult = { subtype: message.subtype, text: message.errors.join("\n") };
        else if (message.is_error) errorResult = { subtype: message.subtype, text: message.result };
      } else if (message.type === "assistant") {
        assistantError ??= message.error;
        for (const block of message.message.content) {
          // The first call is the one that runs; later ones are denied.
          if (block.type === "tool_use" && block.name === fullName) toolUseId ??= block.id;
        }
      } else if (message.type === "user" && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type !== "tool_result" || block.tool_use_id !== toolUseId) continue;
          const text = resultText(block.content);
          if (block.is_error === true) throw new ConnectorToolError(`claude.ai ${connector} ${tool} failed: ${text.slice(0, 4000)}`);
          noteClaudeAuth(false);
          // The result is all we need; stopping here skips the model's closing turn.
          abortController.abort();
          return text;
        }
      }
    }
  } catch (error) {
    if (error instanceof ConnectorRelayError) throw error;
    // An error after the relay stopped the session is only the stop itself, and one after
    // an error result only restates that result.
    if (!abortController.signal.aborted && errorResult === undefined) thrown = error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
  const thrownText = thrown === undefined ? undefined : errorMessage(thrown).replace(ERROR_RESULT_PREFIX, "").trim();
  const ending = relayEnding({
    cancelled: options.signal?.aborted === true,
    timedOut,
    // Allowed but not yet streamed back still counts as called: guessing "not sent" could send twice.
    called: called || toolUseId !== undefined,
    thrown: thrownText,
    errorResult,
    assistantError,
  });
  const claudeText = thrownText ?? errorResult?.text ?? "";
  switch (ending) {
    case "cancelled":
      throw new ConnectorRelayError(`The claude.ai ${connector} call was cancelled`);
    case "claude-login":
      noteClaudeAuth(true);
      throw new ConnectorClaudeError("claude-login", claudeText === "" ? "Claude refused your login. Log in to Claude again." : `${claudeText}. Log in to Claude again.`);
    case "claude-limit":
      throw new ConnectorClaudeError("claude-limit", claudeText === "" ? "Claude's usage limit is reached." : claudeText);
    case "failed":
      throw new ConnectorRelayError(`claude.ai ${connector} relay failed: ${claudeText === "" ? (errorResult?.subtype ?? "unknown error") : claudeText}`, { cause: thrown });
    case "timed-out-before-call":
      throw new RelayTimeoutError(connector, RELAY_TIMEOUT_MS / 1000);
    case "not-connected":
      throw new ConnectorNotConnectedError(connector);
    case "maybe-sent":
      // For a send or a reply it may have gone through even without an answer.
      throw new ToolTimeoutError(`claude.ai ${connector} did not answer within ${RELAY_TIMEOUT_MS / 1000} seconds. ${tool} may still have gone through, so check before trying again.`);
  }
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
