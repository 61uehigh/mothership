import { query, type HookInput, type HookJSONOutput, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { clipToolOutput, type AgentEvent } from "@/features/sessions/model/AgentEvents";
import { type AgentAdapter, type AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import { parseGitCommand, touchesGitDir } from "@/features/sessions/server/adapters/gitGate";
import { connectorServerName, type McpServer } from "@/platform/mcp/McpRegistry";
import { claudeExecutable } from "@/platform/agentBinaries";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * ### CLAUDE_BUILT_IN_TOOLS
 *
 * Claude Code tools every Claude agent may use (Bash and sub-agents are added separately).
 */
export const CLAUDE_BUILT_IN_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "WebSearch", "WebFetch"];
/** Claude's own sub-agent tool ("Task" in older Claude Code). Its runs are reported as `subagent` events. */
const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);
const SUBAGENT_OUTPUT_MAX = 4000;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: unknown) => (typeof block === "object" && block !== null && "text" in block && typeof block.text === "string" ? block.text : ""))
    .join("\n");
}

function field(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null || !(key in input)) return undefined;
  // `key in input` narrowed `input` to an object with that key; its value is unknown.
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function toClaudeServer(server: McpServer): McpServerConfig {
  if (server.transport === "http") {
    return { type: "http", url: server.url, headers: server.headers };
  }
  return { type: "stdio", command: server.command, args: server.args, env: server.env };
}

/** Long enough to wait for the human to answer a push approval. */
const APPROVAL_TIMEOUT_SECONDS = 60 * 60;

/**
 * The real location a file path points at, following symlinks in the part
 * that exists (the file itself may not exist yet).
 */
function realTarget(filePath: string, cwd: string): string {
  let existing = path.resolve(/*turbopackIgnore: true*/ cwd, filePath);
  const rest: Array<string> = [];
  while (!existsSync(/*turbopackIgnore: true*/ existing) && path.dirname(existing) !== existing) {
    rest.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  try {
    return path.join(realpathSync(/*turbopackIgnore: true*/ existing), ...rest);
  } catch {
    return existing;
  }
}

function deny(reason: string): HookJSONOutput {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

/**
 * The shell gate of a session with "Allow git": a plain git command runs
 * outside the sandbox (hooks disabled), a push only after the human allows
 * it, and anything else either stays sandboxed (sessions with a shell) or is
 * refused.
 */
async function bashGate(input: HookInput, request: AgentRequest, hookSignal: AbortSignal): Promise<HookJSONOutput> {
  if (input.hook_event_name !== "PreToolUse") return {};
  const original = typeof input.tool_input === "object" && input.tool_input !== null ? input.tool_input : {};
  const git = parseGitCommand(field(input.tool_input, "command") ?? "");
  if ("refused" in git) {
    if (!request.allowShell) return deny(`This session may only run git commands: ${git.refused}.`);
    // A sandboxed shell as usual; it may not ask to leave the sandbox.
    return { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...original, dangerouslyDisableSandbox: false } } };
  }
  // Waits for your answer until the turn stops or the hook itself times out.
  if (git.needsApproval && !(await request.approve(git.display, AbortSignal.any([request.signal, hookSignal])))) {
    return deny("The human did not allow this push.");
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { ...original, command: git.command, dangerouslyDisableSandbox: true },
    },
  };
}

async function* turn(request: AgentRequest): AsyncGenerator<AgentEvent> {
  const abortController = new AbortController();
  // Stop may have been pressed before the turn got here.
  if (request.signal.aborted) abortController.abort();
  else request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  const stream = query({
    prompt: request.prompt,
    options: {
      ...claudeExecutable(),
      cwd: request.workingDirectory,
      model: request.model,
      effort: request.effort,
      resume: request.sessionRef,
      abortController,
      mcpServers: Object.fromEntries(request.mcpServers.map((s) => [s.name, toClaudeServer(s)])),
      // No human is attached to approve prompts, so everything not listed is denied
      // rather than hanging.
      permissionMode: "dontAsk",
      // Shell only inside the OS sandbox: writes stay in the working directory, and a
      // command the sandbox cannot contain fails instead of running unsandboxed.
      ...(request.allowShell
        ? {
            sandbox: {
              enabled: true,
              failIfUnavailable: true,
              autoAllowBashIfSandboxed: true,
              // Only git may leave the sandbox (it needs the network to fetch and push);
              // the Bash hook below refuses that to every other command.
              allowUnsandboxedCommands: request.allowGit,
              filesystem: { allowWrite: [request.workingDirectory] },
            },
          }
        : {}),
      // Claude may run its own sub-agents. They run in the foreground so they finish
      // inside this turn (a background one would outlive it and be cut off).
      hooks: {
        PreToolUse: [
          ...(request.allowGit
            ? [
                {
                  // The gate for "Allow git": decides every shell command before any permission rule.
                  matcher: "Bash",
                  timeout: APPROVAL_TIMEOUT_SECONDS,
                  hooks: [async (input: HookInput, _toolUseId: string | undefined, { signal }: { signal: AbortSignal }) => bashGate(input, request, signal)],
                },
              ]
            : []),
          {
            // Every session: .git decides which programs git runs (hooks, fsmonitor, filters),
            // including the git mothership itself runs to diff and merge a worktree.
            matcher: "Edit|MultiEdit|Write|NotebookEdit",
            hooks: [
              async (input: HookInput) => {
                const path = input.hook_event_name === "PreToolUse" ? field(input.tool_input, "file_path") ?? field(input.tool_input, "notebook_path") : undefined;
                return path !== undefined && (touchesGitDir(path) || touchesGitDir(realTarget(path, request.workingDirectory)))
                  ? deny("Files inside .git cannot be edited from a session")
                  : {};
              },
            ],
          },
          {
            matcher: [...SUBAGENT_TOOLS].join("|"),
            hooks: [
              async (input) => ({
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  updatedInput: {
                    ...(input.hook_event_name === "PreToolUse" && typeof input.tool_input === "object" && input.tool_input !== null
                      ? input.tool_input
                      : {}),
                    run_in_background: false,
                  },
                },
              }),
            ],
          },
        ],
      },
      // Without a worktree there is no shell at all. Leaving Bash merely unlisted is not
      // enough: Claude Code still runs commands it judges read-only (seen with `echo`),
      // unsandboxed. Disallowing removes the tool from the model's context.
      ...(request.allowShell || request.allowGit ? {} : { disallowedTools: ["Bash"] }),
      allowedTools: [
        ...CLAUDE_BUILT_IN_TOOLS,
        ...SUBAGENT_TOOLS,
        ...(request.allowShell ? ["Bash"] : []),
        ...request.mcpServers.map((s) => `mcp__${s.name}`),
        // claude.ai connectors load automatically under a `claude` login; only the listed ones may be used.
        ...request.claudeConnectors.map((c) => `mcp__${connectorServerName(c)}`),
      ],
    },
  });

  let sessionReported = false;
  /** Tool calls of this agent that started a sub-agent; their results end it. */
  const subagents = new Set<string>();
  for await (const message of stream) {
    if (!sessionReported && "session_id" in message && typeof message.session_id === "string") {
      sessionReported = true;
      yield { type: "session", ref: message.session_id };
    }
    if (message.type === "rate_limit_event") {
      yield { type: "usage", provider: "claude", info: message.rate_limit_info };
    } else if (message.type === "assistant" && message.parent_tool_use_id !== null) {
      // Inside a sub-agent: only its tool use is recorded, as progress of that sub-agent.
      for (const block of message.message.content) {
        if (block.type === "tool_use") yield { type: "subagent", phase: "step", id: message.parent_tool_use_id, tool: block.name };
      }
    } else if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") yield { type: "text", text: block.text };
        if (block.type === "tool_use" && SUBAGENT_TOOLS.has(block.name)) {
          subagents.add(block.id);
          yield {
            type: "subagent",
            phase: "start",
            id: block.id,
            description: field(block.input, "description") ?? "Sub-agent",
            kind: field(block.input, "subagent_type") ?? "general-purpose",
            model: field(block.input, "model"),
          };
        } else if (block.type === "tool_use") {
          yield { type: "tool", name: block.name, detail: JSON.stringify(block.input), id: block.id };
        }
      }
    } else if (message.type === "user" && message.parent_tool_use_id === null && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type !== "tool_result") continue;
        if (!subagents.has(block.tool_use_id)) {
          yield { type: "tool_result", id: block.tool_use_id, output: clipToolOutput(textOf(block.content)), failed: block.is_error === true };
          continue;
        }
        subagents.delete(block.tool_use_id);
        // The structured result is the sub-agent's report alone; the tool_result text wraps it in a hand-back frame.
        const structured = message.tool_use_result;
        const report =
          typeof structured === "object" && structured !== null && "content" in structured ? textOf(structured.content) : textOf(block.content);
        const output = report.trim();
        yield {
          type: "subagent",
          phase: "end",
          id: block.tool_use_id,
          output: output.length > SUBAGENT_OUTPUT_MAX ? `${output.slice(0, SUBAGENT_OUTPUT_MAX)}…` : output,
          failed: block.is_error === true,
        };
      }
    } else if (message.type === "result") {
      if (message.subtype === "success" && !message.is_error) {
        yield { type: "done", output: message.result, costUsd: message.total_cost_usd };
      } else {
        yield { type: "error", message: `Claude run ended: ${message.subtype}` };
      }
      return;
    }
  }
  if (!request.signal.aborted) yield { type: "error", message: "Claude stream ended without a result" };
}

// The SDK throws on process failures and on abort ("Claude Code process
// aborted by user"); the adapter contract turns those into events.
async function* run(request: AgentRequest): AsyncGenerator<AgentEvent> {
  try {
    yield* turn(request);
  } catch (error) {
    if (request.signal.aborted) return;
    yield { type: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * ### claudeAdapter
 *
 * Drives the Claude Agent SDK. Authenticates with `ANTHROPIC_API_KEY` when set,
 * otherwise with the local `claude` login.
 */
export const claudeAdapter: AgentAdapter = { kind: "claude", run };
