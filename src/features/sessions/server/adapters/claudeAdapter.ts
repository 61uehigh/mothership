import { query, type HookInput, type HookJSONOutput, type McpServerConfig, type Options, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent } from "@/features/sessions/model/AgentEvents";
import { type AgentAdapter, type AgentRequest } from "@/features/sessions/server/adapters/AgentAdapter";
import { parseGitCommand, touchesGitDir } from "@/features/sessions/server/adapters/gitGate";
import { connectorServerName, type McpServer } from "@/platform/mcp/mcpConfig";
import { claudeExecutable } from "@/platform/agentBinaries";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { errorMessage } from "@/lib/errors";
import { envSecret } from "@/platform/envSecret";
import { awaitPromptSuggestion } from "@/features/sessions/server/adapters/promptSuggestion";
import { SUBAGENT_TOOLS, toAgentEvents, type ClaudeStreamState } from "@/features/sessions/server/adapters/claudeMessages";
import { asRecord, stringAt } from "@/lib/unknownValues";
import { CLAUDE_BUILT_IN_TOOLS, claudeTools } from "@/features/sessions/server/adapters/claudeTools";

/** Claude Code's tool for publishing pages to claude.ai, available under a `claude` login. */
const ARTIFACT_TOOL = "Artifact";

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
  const git = parseGitCommand(stringAt(input.tool_input, "command") ?? "");
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

/** Artifact actions that only look; everything else (publish, delete, pin) needs your approval. */
const ARTIFACT_READ_ACTIONS = new Set(["read", "list", "open", "quickstart"]);

/**
 * The Artifact gate: an agent may read and list Artifacts, but publishing,
 * deleting, or pinning one puts the change on claude.ai, so it waits for you
 * to allow it, the same way a `git push` does.
 */
async function artifactGate(input: HookInput, request: AgentRequest, hookSignal: AbortSignal): Promise<HookJSONOutput> {
  if (input.hook_event_name !== "PreToolUse") return {};
  const action = stringAt(input.tool_input, "action") ?? "publish";
  if (ARTIFACT_READ_ACTIONS.has(action)) return {};
  const url = stringAt(input.tool_input, "url");
  const what = stringAt(input.tool_input, "title") ?? stringAt(input.tool_input, "file_path") ?? url ?? "an Artifact";
  const description =
    action === "publish"
      ? `Publish ${what} as an Artifact on claude.ai${url === undefined ? " (a new page, private until you share it)" : ` (updating ${url})`}`
      : `${action[0]?.toUpperCase() ?? ""}${action.slice(1)} the Artifact ${url ?? what}`;
  if (!(await request.approve(description, AbortSignal.any([request.signal, hookSignal])))) {
    return deny("The human did not allow this.");
  }
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
}

type PreToolUseHook = (input: HookInput, toolUseId: string | undefined, options: { signal: AbortSignal }) => Promise<HookJSONOutput>;

/** The PreToolUse hooks every session gets, plus the git gate for one with "Allow git". */
function hooksFor(request: AgentRequest): Array<{ matcher: string; timeout?: number; hooks: Array<PreToolUseHook> }> {
  return [
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
      // Publishing to claude.ai waits for your approval.
      matcher: ARTIFACT_TOOL,
      timeout: APPROVAL_TIMEOUT_SECONDS,
      hooks: [async (input, _toolUseId, { signal }) => artifactGate(input, request, signal)],
    },
    {
      // .git decides which programs git runs (hooks, fsmonitor, filters),
      // including the git mothership itself runs to diff and merge a worktree.
      matcher: "Edit|MultiEdit|Write|NotebookEdit",
      hooks: [
        async (input) => {
          const target = input.hook_event_name === "PreToolUse" ? (stringAt(input.tool_input, "file_path") ?? stringAt(input.tool_input, "notebook_path")) : undefined;
          return target !== undefined && (touchesGitDir(target) || touchesGitDir(realTarget(target, request.workingDirectory)))
            ? deny("Files inside .git cannot be edited from a session")
            : {};
        },
      ],
    },
    {
      // Claude's own sub-agents run in the foreground so they finish inside this
      // turn (a background one would outlive it and be cut off).
      matcher: [...SUBAGENT_TOOLS].join("|"),
      hooks: [
        async (input) => ({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            updatedInput: { ...(input.hook_event_name === "PreToolUse" ? asRecord(input.tool_input) : undefined), run_in_background: false },
          },
        }),
      ],
    },
  ];
}

/** The SDK options of one turn: the sandbox, the hooks, and which tools may be used. */
function claudeOptions(request: AgentRequest, abortController: AbortController): Options {
  return {
    ...claudeExecutable(),
    cwd: request.workingDirectory,
    model: request.model,
    effort: request.effort,
    resume: request.sessionRef,
    abortController,
    // A predicted next prompt after each turn (never after the first); it reuses the turn's prompt cache.
    promptSuggestions: request.promptSuggestions,
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
            // the Bash hook refuses that to every other command.
            allowUnsandboxedCommands: request.allowGit,
            filesystem: { allowWrite: [request.workingDirectory] },
          },
        }
      : {}),
    hooks: { PreToolUse: hooksFor(request) },
    // Without a worktree there is no shell at all. Leaving Bash merely unlisted is not
    // enough: Claude Code still runs commands it judges read-only (seen with `echo`),
    // unsandboxed. Disallowing removes the tool from the model's context.
    ...(request.allowShell || request.allowGit ? {} : { disallowedTools: ["Bash"] }),
    allowedTools: [
      ...Object.keys(CLAUDE_BUILT_IN_TOOLS),
      ...SUBAGENT_TOOLS,
      // Allowed here, and gated by its hook.
      ARTIFACT_TOOL,
      ...(request.allowShell ? ["Bash"] : []),
      ...request.mcpServers.map((s) => `mcp__${s.name}`),
      // claude.ai connectors load automatically under a `claude` login; only the listed ones may be used.
      ...request.claudeConnectors.map((c) => `mcp__${connectorServerName(c)}`),
    ],
  };
}

/**
 * The stream as a loop can read it, where leaving the loop ends the agent
 * process unless `handOff` was called first: then the rest of the stream is
 * read in the background for the suggested next prompt.
 */
function withSuggestionHandOff(stream: Query, request: AgentRequest, abortController: AbortController): { messages: AsyncIterable<SDKMessage>; handOff: () => void } {
  let handedOff = false;
  return {
    messages: {
      [Symbol.asyncIterator]: () => ({
        next: () => stream.next(),
        return: async () => {
          if (!handedOff) await stream.return(undefined);
          return { done: true, value: undefined };
        },
      }),
    },
    handOff: () => {
      handedOff = true;
      request.onSuggestionWait(
        awaitPromptSuggestion(stream, { onSuggestion: request.onSuggestion, stop: () => abortController.abort(), signal: request.suggestionSignal }),
      );
    },
  };
}

async function* turn(request: AgentRequest): AsyncGenerator<AgentEvent> {
  const abortController = new AbortController();
  // Stop may have been pressed before the turn got here.
  if (request.signal.aborted) abortController.abort();
  else request.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  const stream = query({ prompt: request.prompt, options: claudeOptions(request, abortController) });
  const { messages, handOff } = withSuggestionHandOff(stream, request, abortController);
  const state: ClaudeStreamState = { sessionReported: false, subagents: new Set() };
  // The same rule Claude Code follows: an API key in the environment wins over the login.
  const billing = envSecret("ANTHROPIC_API_KEY") !== undefined ? "api" : "subscription";
  for await (const message of messages) {
    const events = toAgentEvents(message, state, billing);
    yield* events;
    if (message.type !== "result") continue;
    if (events.some((event) => event.type === "done") && request.promptSuggestions && !request.signal.aborted) handOff();
    return;
  }
  if (!request.signal.aborted) {
    yield { type: "error", message: "Claude stream ended without a result", failure: { code: "stream-ended", provider: "claude" } };
  }
}

// The SDK throws on process failures and on abort ("Claude Code process
// aborted by user"); the adapter contract turns those into events.
async function* run(request: AgentRequest): AsyncGenerator<AgentEvent> {
  try {
    yield* turn(request);
  } catch (error) {
    if (request.signal.aborted) return;
    yield { type: "error", message: errorMessage(error) };
  }
}

/**
 * ### claudeAdapter
 *
 * Drives the Claude Agent SDK. Authenticates with `ANTHROPIC_API_KEY` when set,
 * otherwise with the local `claude` login.
 */
export const claudeAdapter: AgentAdapter = { kind: "claude", tools: claudeTools, run };
