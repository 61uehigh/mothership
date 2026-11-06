import type { AgentEvent, AgentKind, Effort } from "@/features/sessions/model/AgentEvents";
import type { BuiltInTool, ToolNote } from "@/features/sessions/model/AgentTools";
import type { McpServer } from "@/platform/mcp/mcpConfig";

/**
 * ### AgentRequest
 *
 * One turn of a long-lived agent conversation.
 */
export type AgentRequest = {
  /** The new user message for this turn. */
  prompt: string;
  /** Conversation to continue, from an earlier `session` event; `undefined` starts fresh. */
  sessionRef: string | undefined;
  /** Provider-specific model id; `undefined` lets the provider pick its default. */
  model: string | undefined;
  /** `undefined` keeps the provider default. */
  effort: Effort | undefined;
  /** MCP servers the agent may call. Adapters skip transports they cannot use. */
  mcpServers: Array<McpServer>;
  /** claude.ai connectors (e.g. "Slack") the agent may call; only the Claude adapter can. */
  claudeConnectors: Array<string>;
  /** Directory the agent may read and write. */
  workingDirectory: string;
  /**
   * Allow shell commands, sandboxed to `workingDirectory`. Set for agents in
   * their own worktree; Codex always has a sandboxed shell.
   */
  allowShell: boolean;
  /**
   * Let the agent commit and reach GitHub. Claude: plain `git` commands in
   * `workingDirectory` run outside the sandbox, even without a shell, every
   * push asked first; every other command stays blocked or sandboxed. Codex:
   * its sandbox may write the git directories and reach GitHub's hosts only
   * (see `codexSandbox`), with nothing asked.
   */
  allowGit: boolean;
  /**
   * Asks the human to allow an action that needs approval (`git push`,
   * publishing an Artifact) and resolves with the answer; `false` when the
   * turn is stopped first.
   */
  approve: (action: string, signal: AbortSignal) => Promise<boolean>;
  /** Aborting stops the underlying agent process or request. */
  signal: AbortSignal;
  /** Ask the provider to predict your next prompt once the turn ends (see `onSuggestion`). */
  promptSuggestions: boolean;
  /**
   * Receives the predicted next prompt. It may come after the `done` event,
   * even after `run` has returned, so the turn does not wait for it.
   */
  onSuggestion: (suggestion: string) => void;
  /**
   * Aborting ends the wait for the suggestion after `done`, and stops the
   * process kept running for it. The scheduler aborts it before the agent's
   * next turn, a stop, a worktree removal, or shutdown.
   */
  suggestionSignal: AbortSignal;
  /**
   * Called when work outlives the turn to wait for the suggestion (the agent
   * process, or a second one). `finished` settles, never rejecting, once that
   * work has ended, so the scheduler can wait for it.
   */
  onSuggestionWait: (finished: Promise<void>) => void;
};

/**
 * ### AdapterTools
 *
 * What a backend brings to a session's tool list (see `toolAvailability`).
 */
export type AdapterTools = {
  /** The backend's own file, web, and shell tools for a session, available or not and why. */
  builtIn: (session: { worktreeActive: boolean }) => Array<{ tool: BuiltInTool; available: boolean; note: ToolNote | undefined }>;
  /**
   * Which row a recorded tool call counts toward: a {@link BuiltInTool},
   * `mcp:<server>` for an MCP call, or the name itself when unknown.
   */
  usageKey: (toolName: string) => string;
};

/**
 * ### AgentAdapter
 *
 * The single contract every backend implements. `run` never throws: it ends
 * with exactly one `done` or `error` event, or, once `signal` is aborted,
 * simply returns (the caller records the interruption).
 */
export type AgentAdapter = {
  /** Which backend this adapter drives. */
  kind: AgentKind;
  /** What this backend adds to a session's tool list. */
  tools: AdapterTools;
  /**
   * ### run
   *
   * Executes one turn and streams progress.
   *
   * @param request - The turn to execute.
   * @returns Events in arrival order, terminated by `done` or `error` unless aborted.
   */
  run: (request: AgentRequest) => AsyncGenerator<AgentEvent>;
};
