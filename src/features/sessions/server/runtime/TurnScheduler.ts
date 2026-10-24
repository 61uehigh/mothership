import { randomBytes, randomUUID } from "node:crypto";
import type { Agent, AgentMessage, LiveUpdate, MessageKind } from "@/features/sessions/model/Agent";
import { AGENT_KINDS, EFFORTS, type TurnUsage, type UsageTotals } from "@/features/sessions/model/AgentEvents";
import { ADAPTERS } from "@/features/sessions/server/adapters";
import type { McpConfig, McpServer } from "@/platform/mcp/McpRegistry";
import type { AgentStore } from "@/features/sessions/server/AgentStore";
import { agentPreamble } from "@/features/sessions/server/agentPreamble";
import { RuntimeLimitError } from "@/features/sessions/server/runtime/RuntimeLimitError";
import { existsSync } from "node:fs";

/** Turns running at once across all agents; the rest wait in their queues. */
const MAX_CONCURRENT_TURNS = 6;

/**
 * ### REPORT_MAX_CHARS
 *
 * Longest turn output passed to another agent, in a report or a summary.
 */
export const REPORT_MAX_CHARS = 6000;

/**
 * ### truncate
 *
 * @returns `text` cut to `max` characters, marked when cut.
 */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…(truncated)`;
}

/**
 * What one turn used: the session's totals after it minus those before it.
 *
 * @param fresh - Whether the turn started a new session, so nothing came before it.
 * @returns `undefined` when the provider reports no totals or the earlier ones are unknown.
 */
function turnUsage(after: UsageTotals | undefined, before: UsageTotals | undefined, fresh: boolean): TurnUsage | undefined {
  if (after === undefined) return undefined;
  if (fresh) return after;
  if (before === undefined) return undefined;
  const usage: TurnUsage = {
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    cacheReadTokens: after.cacheReadTokens - before.cacheReadTokens,
    cacheWriteTokens: after.cacheWriteTokens - before.cacheWriteTokens,
    costUsd: after.costUsd - before.costUsd,
    billing: after.billing,
  };
  // The totals went backwards (the session was cleared or compacted elsewhere): no reliable answer.
  return Object.values(usage).some((value) => typeof value === "number" && value < 0) ? undefined : usage;
}

/**
 * ### TurnSchedulerDeps
 *
 * What {@link TurnScheduler} needs from the runtime around it.
 */
export type TurnSchedulerDeps = {
  /** Only the tables a turn touches. */
  store: Pick<AgentStore, "agents" | "messages" | "events" | "tokens">;
  /** Broadcasts a state change to subscribers. */
  emit: (update: LiveUpdate) => void;
  /** Where agents' mothership MCP servers reach this app. */
  baseUrl: string;
  /** Whether a merge, discard, or delete holds the agent; no turn starts meanwhile. */
  isBusy: (agentId: string) => boolean;
  /** Asks the human to allow a command (see `AgentRequest.approve`). */
  approve: (agentId: string, command: string, signal: AbortSignal) => Promise<boolean>;
} & RuntimeEnvironment;

/**
 * ### RuntimeEnvironment
 *
 * What the runtime takes from the app around it, so it never reaches for
 * settings, usage tracking, or file locations itself.
 */
export type RuntimeEnvironment = {
  /** The MCP config with your Settings choices applied, read at the start of each turn. */
  mcpConfig: () => Promise<McpConfig>;
  /** Receives Claude's usage limits as turns report them. */
  onRateLimit: (info: unknown) => void;
  /** Path of the script agents run as their mothership MCP server. */
  controlScript: string;
};

/**
 * ### TurnScheduler
 *
 * Owns every agent's turn loop. Messages queue in SQLite and are delivered one
 * turn at a time per agent; up to {@link MAX_CONCURRENT_TURNS} agents run at
 * once. When a turn started by another agent's message ends, its result is
 * reported back to that agent automatically.
 *
 * Worktree operations coordinate with it through {@link TurnScheduler.isRunning},
 * {@link TurnScheduler.stop}, {@link TurnScheduler.whenIdle}, and
 * {@link TurnScheduler.pump}; it in turn skips agents they hold (`isBusy`).
 */
export class TurnScheduler {
  readonly #deps: TurnSchedulerDeps;
  readonly #running = new Map<string, AbortController>();
  /** Settles when the agent's running turn has fully finished (its process exited). */
  readonly #turns = new Map<string, Promise<void>>();
  /** Agents stopped by the human: their queue waits until a new message arrives. */
  readonly #paused = new Set<string>();

  constructor(deps: TurnSchedulerDeps) {
    this.#deps = deps;
  }

  /**
   * ### enqueue
   *
   * Queues a message and starts a turn when the agent and a run slot are free.
   * New work brings an archived session back and lifts a stop.
   *
   * @param senderId - Sending agent, or `undefined` for the human or mothership.
   * @returns The queued message.
   * @throws Error When the agent does not exist.
   * @throws {@link RuntimeLimitError} When the agent's worktree was merged or discarded.
   */
  enqueue(agentId: string, text: string, senderId: string | undefined, kind: MessageKind): AgentMessage {
    const { store, emit } = this.#deps;
    const target = store.agents.get(agentId);
    if (target === undefined) throw new Error(`Unknown agent ${agentId}`);
    if (target.worktree !== undefined && target.worktree.state !== "active") {
      throw new RuntimeLimitError(
        `The working folder of "${target.name}" was ${target.worktree.state === "merged" ? "merged" : "discarded"}, so it can no longer take on work.`,
      );
    }
    const message: AgentMessage = {
      id: randomUUID(),
      agentId,
      senderId,
      kind,
      text,
      createdAt: Date.now(),
      deliveredAt: undefined,
    };
    store.messages.insert(message);
    emit({ type: "message", message });
    if (target.archivedAt !== undefined) emit({ type: "agent", agent: store.agents.setArchived(agentId, false) });
    this.#paused.delete(agentId);
    this.pump(agentId);
    return message;
  }

  /**
   * ### stop
   *
   * Aborts the agent's current turn. Its queued messages wait until the next
   * message arrives.
   *
   * @returns Whether a turn was running.
   */
  stop(agentId: string): boolean {
    const controller = this.#running.get(agentId);
    if (controller === undefined) return false;
    this.#paused.add(agentId);
    controller.abort();
    return true;
  }

  /**
   * ### isRunning
   *
   * @returns Whether a turn of the agent is in progress.
   */
  isRunning(agentId: string): boolean {
    return this.#running.has(agentId);
  }

  /**
   * ### whenIdle
   *
   * @returns Settles (never rejects) once the agent's running turn has fully
   *   finished, its process included; immediately when none is running.
   */
  whenIdle(agentId: string): Promise<void> {
    return this.#turns.get(agentId) ?? Promise.resolve();
  }

  /**
   * ### forget
   *
   * Drops per-agent scheduling state; call after the agent is deleted.
   */
  forget(agentId: string): void {
    this.#paused.delete(agentId);
  }

  /**
   * ### canTakeWork
   *
   * @returns Whether the agent exists, its worktree (if any) is still active,
   *   and its working folder still exists (a sub-agent working inside a parent's
   *   merged or discarded worktree has nothing left to work in).
   */
  canTakeWork(agentId: string): boolean {
    const agent = this.#deps.store.agents.get(agentId);
    return agent !== undefined && (agent.worktree === undefined || agent.worktree.state === "active") && existsSync(/*turbopackIgnore: true*/ agent.workingDirectory);
  }

  /**
   * ### pump
   *
   * Starts the agent's next queued turn if it is free (not running, stopped,
   * or held by a worktree operation) and a run slot is available.
   */
  pump(agentId: string): void {
    const { store, emit } = this.#deps;
    if (this.#running.has(agentId) || this.#paused.has(agentId) || this.#deps.isBusy(agentId)) return;
    if (!this.canTakeWork(agentId)) return;
    if (this.#running.size >= MAX_CONCURRENT_TURNS) return;
    const message = store.messages.takeNext(agentId);
    if (message === undefined) return;

    const controller = new AbortController();
    this.#running.set(agentId, controller);
    emit({ type: "message", message });
    const turn = this.#runTurn(agentId, message, controller.signal)
      .catch((error: unknown) => {
        // Adapters should not throw, but a stop is an interruption, not a failure, regardless.
        if (controller.signal.aborted) {
          this.#setStatus(agentId, "interrupted");
          this.#report(agentId, message, "The human stopped this agent's work.");
          return;
        }
        const text = error instanceof Error ? error.message : String(error);
        emit({ type: "event", record: store.events.insert(agentId, { type: "error", message: text }) });
        this.#setStatus(agentId, "failed");
        this.#report(agentId, message, `Failed: ${text}`);
      })
      .catch((error: unknown) => console.error(`[mothership] could not record the end of a turn for ${agentId}`, error))
      .finally(() => {
        this.#running.delete(agentId);
        this.#turns.delete(agentId);
        // A finished turn frees a slot; give it to whichever agent has waited longest.
        for (const id of store.messages.agentsWithQueued()) this.pump(id);
      });
    this.#turns.set(agentId, turn);
  }

  #setStatus(agentId: string, status: Agent["status"]): void {
    this.#deps.emit({ type: "agent", agent: this.#deps.store.agents.update(agentId, { status }) });
  }

  #controlServer(agent: Agent): McpServer {
    return {
      name: "mothership",
      transport: "stdio",
      command: process.execPath,
      args: [this.#deps.controlScript],
      env: {
        MOTHERSHIP_URL: this.#deps.baseUrl,
        MOTHERSHIP_AGENT_TOKEN: this.#deps.store.tokens.forAgent(agent.id, () => randomBytes(24).toString("hex")),
        // The script is plain JavaScript and cannot import these lists, so it gets them here.
        MOTHERSHIP_PROVIDERS: AGENT_KINDS.join(","),
        MOTHERSHIP_EFFORTS: EFFORTS.join(","),
        // In the desktop app `process.execPath` is Electron; this makes it plain Node (no effect under Node).
        // Set here because agent CLIs start MCP servers with only a few of their own variables.
        ELECTRON_RUN_AS_NODE: "1",
      },
    };
  }

  #prompt(agent: Agent, message: AgentMessage): string {
    const { store } = this.#deps;
    const sender = message.senderId === undefined ? undefined : store.agents.get(message.senderId);
    const body =
      message.kind === "report" && sender !== undefined
        ? `[Report from agent "${sender.name}" (${sender.id})]\n${message.text}`
        : sender !== undefined
          ? `[Message from agent "${sender.name}" (${sender.id})]\n${message.text}`
          : message.text;
    // Providers keep the conversation, so the briefing is needed only once.
    // Briefed until its first turn in mothership completes; an imported session
    // already has a provider session but has never had mothership's briefing.
    const briefed = agent.sessionRef !== undefined && store.events.lastDoneOutput(agent.id) !== undefined;
    return briefed ? body : `${agentPreamble(agent, store.agents.get(agent.parentId ?? ""))}\n\n---\n\n${body}`;
  }

  /**
   * Tells the agent that sent `trigger` how the turn it caused ended. Reports
   * and mothership messages never trigger reports, so replies cannot loop.
   */
  #report(agentId: string, trigger: AgentMessage, outcome: string): void {
    if (trigger.kind !== "message" || trigger.senderId === undefined) return;
    // A sender that was deleted, merged, or discarded meanwhile has no one to read the report.
    if (!this.canTakeWork(trigger.senderId)) return;
    this.enqueue(trigger.senderId, truncate(outcome, REPORT_MAX_CHARS), agentId, "report");
  }

  async #runTurn(agentId: string, message: AgentMessage, signal: AbortSignal): Promise<void> {
    const { store, emit } = this.#deps;
    this.#setStatus(agentId, "running");
    const agent = store.agents.get(agentId);
    if (agent === undefined) return;
    const { servers, claudeConnectors } = await this.#deps.mcpConfig();
    const allowed = (name: string) => agent.mcp === undefined || agent.mcp.includes(name);

    // What the session had used before this turn; a new session starts from nothing. A session
    // resumed from outside mothership has earlier use mothership never saw, so its first turn has none.
    const before = agent.sessionRef === undefined ? undefined : store.events.lastDoneTotals(agentId);
    const fresh = agent.sessionRef === undefined;

    let output: string | undefined;
    let failure: string | undefined;
    for await (const reported of ADAPTERS[agent.provider].run({
      prompt: this.#prompt(agent, message),
      sessionRef: agent.sessionRef,
      model: agent.model,
      effort: agent.effort,
      mcpServers: [this.#controlServer(agent), ...servers.filter((s) => allowed(s.name))],
      claudeConnectors: [...claudeConnectors].filter(([name]) => allowed(name)).map(([, connector]) => connector),
      workingDirectory: agent.workingDirectory,
      allowShell: agent.worktree?.state === "active",
      allowGit: agent.allowGit && agent.provider === "claude",
      approve: (action, approvalSignal) => this.#deps.approve(agentId, action, approvalSignal),
      signal,
    })) {
      const event = reported.type === "done" ? { ...reported, usage: turnUsage(reported.totals, before, fresh) } : reported;
      if (event.type === "session") {
        store.agents.update(agentId, { sessionRef: event.ref });
        continue;
      }
      if (event.type === "usage") {
        if (event.provider === "claude") this.#deps.onRateLimit(event.info);
        continue;
      }
      emit({ type: "event", record: store.events.insert(agentId, event) });
      if (event.type === "done") output = event.output;
      if (event.type === "error") failure = event.message;
    }

    if (signal.aborted) {
      this.#setStatus(agentId, "interrupted");
      this.#report(agentId, message, "The human stopped this agent's work.");
    } else if (output !== undefined) {
      this.#setStatus(agentId, "idle");
      this.#report(agentId, message, output || "(no output)");
    } else {
      this.#setStatus(agentId, "failed");
      this.#report(agentId, message, `Failed: ${failure ?? "unknown error"}`);
    }
  }
}
