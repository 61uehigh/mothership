import type { AgentEvent, AgentKind, Effort } from "@/features/sessions/model/AgentEvents";
import type { McpServer } from "@/platform/mcp/McpRegistry";

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
   * their own worktree; Codex always has a sandboxed shell, OpenAI never does.
   */
  allowShell: boolean;
  /**
   * Allow plain `git` commands in `workingDirectory`, outside the sandbox (so
   * fetch and push reach the network), even without a shell. Every other
   * command stays blocked or sandboxed. Only the Claude adapter honours it.
   */
  allowGit: boolean;
  /**
   * Asks the human to allow a command that needs approval (`git push`) and
   * resolves with the answer; `false` when the turn is stopped first.
   */
  approve: (command: string, signal: AbortSignal) => Promise<boolean>;
  /** Aborting stops the underlying agent process or request. */
  signal: AbortSignal;
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
