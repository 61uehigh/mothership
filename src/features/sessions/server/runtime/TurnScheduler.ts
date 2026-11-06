import { randomBytes, randomUUID } from "node:crypto";
import type { Agent, AgentMessage, LiveUpdate, MessageKind } from "@/features/sessions/model/Agent";
import { AGENT_KINDS, EFFORTS, type AgentEvent, AGENT_CAPABILITIES } from "@/features/sessions/model/AgentEvents";
import { ADAPTERS } from "@/features/sessions/server/adapters";
import type { McpServer } from "@/platform/mcp/mcpConfig";
import type { AgentStore } from "@/features/sessions/server/AgentStore";
import type { RuntimeEnvironment } from "@/features/sessions/server/AgentRuntime";
import { agentPreamble } from "@/features/sessions/server/agentPreamble";
import { RuntimeLimitError } from "@/features/sessions/server/runtime/RuntimeLimitError";
import { mayStartTurn, turnUsage } from "@/features/sessions/server/runtime/turnRules";
import { existsSync } from "node:fs";
import { errorMessage } from "@/lib/errors";
import { isTerminationExit, turnOutcome, type TurnOutcome } from "@/features/sessions/model/Restart";

/**
 * How long a turn whose agent was terminated from outside waits for mothership's own
 * shutdown to begin: quitting the app signals the server and its agents at the same
 * moment, and the agent's exit can be noticed first.
 */
const TERMINATION_GRACE_MS = 1_500;

/** Longest turn output passed to another agent, in a report or a summary. */
const REPORT_MAX_CHARS = 6000;

/**
 * ### truncateReport
 *
 * @returns A turn's output cut to what is passed to another agent, in a
 *   report or a summary, and marked for that agent when cut.
 */
export function truncateReport(text: string): string {
  return text.length <= REPORT_MAX_CHARS ? text : `${text.slice(0, REPORT_MAX_CHARS)}\n…(truncated)`;
}

/**
 * ### TurnSchedulerDependencies
 *
 * What {@link TurnScheduler} needs from the runtime around it.
 */
export type TurnSchedulerDependencies = {
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
 * ### TurnScheduler
 *
 * Owns every agent's turn loop. Messages queue in SQLite and are delivered one
 * turn at a time per agent; up to `MAX_CONCURRENT_TURNS` agents run at
 * once. When a turn started by another agent's message ends, its result is
 * reported back to that agent automatically.
 *
 * Worktree operations coordinate with it through {@link TurnScheduler.isRunning},
 * {@link TurnScheduler.stop}, {@link TurnScheduler.whenIdle}, and
 * {@link TurnScheduler.pump}; it in turn skips agents they hold (`isBusy`).
 */
export class TurnScheduler {
  readonly #deps: TurnSchedulerDependencies;
  readonly #running = new Map<string, AbortController>();
  /** Settles when the agent's running turn has fully finished (its process exited). */
  readonly #turns = new Map<string, Promise<void>>();
  /** Agents stopped by the human: their queue waits until a new message arrives. */
  readonly #paused = new Set<string>();
  /** mothership has begun stopping: no new turns, and turns that end now were cut off by it. */
  #shuttingDown = false;
  /** Each agent's latest turn; a suggestion from an older turn arrives too late to keep. */
  readonly #latestTurn = new Map<string, symbol>();
  /**
   * Work a finished turn left running to wait for its suggestion (the agent's
   * process, or a second Codex one). It is ended before the agent's next turn
   * resumes the same conversation, and on a stop or shutdown.
   */
  readonly #suggestionWaits = new Map<string, { controller: AbortController; finished: Promise<void> }>();

  constructor(deps: TurnSchedulerDependencies) {
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
   * @throws {@link RuntimeLimitError} When the agent's worktree was merged or
   *   discarded, or its working folder no longer exists.
   */
  enqueue(agentId: string, text: string, senderId: string | undefined, kind: MessageKind): AgentMessage {
    const { store, emit } = this.#deps;
    const target = store.agents.get(agentId);
    if (target === undefined) throw new Error(`Unknown agent ${agentId}`);
    if (target.worktree !== undefined && target.worktree.state !== "active") {
      throw new RuntimeLimitError(
        `The working folder of "${target.name}" was ${target.worktree.state === "merged" ? "merged" : "discarded"}, so it can no longer take on work.`,
        "worktree-closed",
      );
    }
    // Refused rather than queued: `pump` would hold the message for ever, with nothing to show why.
    if (!existsSync(/*turbopackIgnore: true*/ target.workingDirectory)) {
      throw new RuntimeLimitError(`The working folder of "${target.name}" (${target.workingDirectory}) no longer exists, so it can't take on work.`, "working-folder-gone");
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
    this.#invalidateSuggestion(target);
    if (target.archivedAt !== undefined) emit({ type: "agent", agent: store.agents.setArchived(agentId, false) });
    // New work picks up a session a restart stopped, as Continue would; its queue no longer waits.
    if (target.status === "interrupted" && target.stoppedByRestart) emit({ type: "agent", agent: store.agents.update(agentId, { status: "idle" }) });
    this.#paused.delete(agentId);
    this.pump(agentId);
    return message;
  }

  /**
   * ### cancel
   *
   * Takes back a message still waiting in the agent's queue.
   *
   * @returns Whether it was removed; `false` when it was already delivered or is unknown.
   */
  cancel(agentId: string, messageId: string): boolean {
    const removed = this.#deps.store.messages.removeQueued(agentId, messageId);
    if (removed) this.#deps.emit({ type: "messageRemoved", agentId, messageId });
    return removed;
  }

  /**
   * ### stop
   *
   * Aborts the agent's current turn, and ends a wait for the last turn's
   * suggestion. Its queued messages wait until the next message arrives.
   *
   * @returns Whether a turn was running.
   */
  stop(agentId: string): boolean {
    void this.#endSuggestionWait(agentId);
    const controller = this.#running.get(agentId);
    if (controller === undefined) return false;
    this.#paused.add(agentId);
    controller.abort();
    return true;
  }

  /**
   * ### shutdown
   *
   * Called when mothership is stopping (the app quits or is updated, the
   * server restarts). Records every running turn as interrupted by the restart
   * right away, synchronously, since the process may exit before the turns
   * notice, then stops them. Starts no turn after this.
   *
   * @returns The agents whose turns were running.
   */
  shutdown(): Array<string> {
    if (this.#shuttingDown) return [];
    this.#shuttingDown = true;
    for (const agentId of [...this.#suggestionWaits.keys()]) void this.#endSuggestionWait(agentId);
    const stopped = [...this.#running.keys()];
    for (const agentId of stopped) {
      try {
        this.#deps.emit({ type: "agent", agent: this.#deps.store.agents.update(agentId, { status: "interrupted", stoppedByRestart: true }) });
      } catch (error) {
        console.error(`[mothership] could not record that ${agentId} was stopped by the restart`, error);
      }
      this.#running.get(agentId)?.abort();
    }
    return stopped;
  }

  /**
   * ### runningAgents
   *
   * @returns The agents whose turns are in progress.
   */
  runningAgents(): Array<string> {
    return [...this.#running.keys()];
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
   *   finished, its process included, and so has any wait for its suggestion
   *   ({@link TurnScheduler.stop} ends that wait); immediately when neither is running.
   */
  async whenIdle(agentId: string): Promise<void> {
    await Promise.all([this.#turns.get(agentId), this.#suggestionWaits.get(agentId)?.finished]);
  }

  /**
   * ### forget
   *
   * Drops per-agent scheduling state; call after the agent is deleted.
   */
  forget(agentId: string): void {
    void this.#endSuggestionWait(agentId);
    this.#paused.delete(agentId);
    this.#latestTurn.delete(agentId);
  }

  /** Ends the agent's wait for a suggestion, if any. @returns Settles once the work it kept running has ended. */
  #endSuggestionWait(agentId: string): Promise<void> {
    const wait = this.#suggestionWaits.get(agentId);
    if (wait === undefined) return Promise.resolve();
    wait.controller.abort();
    return wait.finished;
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
   * ### resume
   *
   * Called once when mothership starts: starts the messages that were waiting
   * for a run slot when it quit, which would otherwise wait until some other
   * turn ends. A session you stopped keeps its queue until your next message,
   * as before the restart; one a restart stopped waits for Continue.
   */
  resume(): void {
    const { store } = this.#deps;
    for (const agent of store.agents.list()) if (agent.status === "interrupted" && !agent.stoppedByRestart) this.#paused.add(agent.id);
    for (const id of store.messages.agentsWithQueued()) this.pump(id);
  }

  /**
   * ### pump
   *
   * Starts the agent's next queued turn if it is free (not running, stopped
   * by you or a restart, or held by a worktree operation) and a run slot is
   * available; see {@link mayStartTurn}.
   */
  pump(agentId: string): void {
    const { store, emit } = this.#deps;
    const agent = store.agents.get(agentId);
    const slot = {
      shuttingDown: this.#shuttingDown,
      running: this.#running.has(agentId),
      paused: this.#paused.has(agentId),
      waitsForContinue: agent?.status === "interrupted" && agent.stoppedByRestart,
      busy: this.#deps.isBusy(agentId),
      canTakeWork: this.canTakeWork(agentId),
      runningTurns: this.#running.size,
    };
    if (!mayStartTurn(slot)) return;
    const message = store.messages.takeNext(agentId);
    if (message === undefined) return;

    const controller = new AbortController();
    this.#running.set(agentId, controller);
    emit({ type: "message", message });
    const turn = this.#runTurn(agentId, message, controller.signal)
      .catch((error: unknown) => {
        // Adapters should not throw, but a stop is an interruption, not a failure, regardless.
        const outcome = turnOutcome({ aborted: controller.signal.aborted, shuttingDown: this.#shuttingDown, finished: false });
        const text = errorMessage(error);
        if (outcome === "failed") emit({ type: "event", record: store.events.insert(agentId, { type: "error", message: text }) });
        this.#end(agentId, message, outcome, undefined, text);
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

  #setStatus(agentId: string, status: Agent["status"], stoppedByRestart = false): void {
    this.#deps.emit({ type: "agent", agent: this.#deps.store.agents.update(agentId, { status, stoppedByRestart }) });
  }

  /** Records how a turn ended and reports it to the agent that sent the work. */
  #end(agentId: string, message: AgentMessage, outcome: TurnOutcome, output: string | undefined, failure: string | undefined): void {
    switch (outcome) {
      case "restart":
        // No report: the sender is being stopped too, and Continue resumes this turn with the same sender.
        this.#setStatus(agentId, "interrupted", true);
        return;
      case "stopped":
        this.#setStatus(agentId, "interrupted");
        this.#report(agentId, message, "The human stopped this agent's work.");
        return;
      case "done":
        this.#setStatus(agentId, "idle");
        this.#report(agentId, message, output || "(no output)");
        return;
      case "failed":
        this.#setStatus(agentId, "failed");
        this.#report(agentId, message, `Failed: ${failure ?? "unknown error"}`);
        return;
    }
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
    this.enqueue(trigger.senderId, truncateReport(outcome), agentId, "report");
  }

  /**
   * New work makes the suggested next prompt stale: the shown one is cleared,
   * and one still on its way is dropped (see `#suggest`). The only place a
   * suggestion is cleared by new work (a closed worktree clears it in
   * `AgentRepository.setWorktreeState`, turning suggestions off in `clearSuggestions`).
   */
  #invalidateSuggestion(agent: Agent): void {
    this.#latestTurn.set(agent.id, Symbol(agent.id));
    if (agent.suggestion !== undefined) this.#deps.emit({ type: "agent", agent: this.#deps.store.agents.setSuggestion(agent.id, undefined) });
  }

  /**
   * ### clearSuggestions
   *
   * Prompt suggestions were turned off: clears every shown suggestion and
   * drops the ones still on their way, so none is left to fill in.
   */
  clearSuggestions(): void {
    const { store, emit } = this.#deps;
    for (const agent of store.agents.list()) {
      this.#latestTurn.set(agent.id, Symbol(agent.id));
      if (agent.suggestion !== undefined) emit({ type: "agent", agent: store.agents.setSuggestion(agent.id, undefined) });
    }
  }

  /**
   * Keeps the next prompt a turn suggested, unless suggestions are now off,
   * another turn has started since, or the agent can no longer take work
   * (gone, or its folder merged, discarded, or removed): sending it would
   * only be refused.
   */
  async #suggest(agentId: string, turn: symbol, suggestion: string): Promise<void> {
    const { store, emit } = this.#deps;
    if (!(await this.#deps.promptSuggestions())) return;
    // Checked after reading the setting: turning it off meanwhile (`clearSuggestions`) makes this turn stale.
    if (this.#latestTurn.get(agentId) !== turn || !this.canTakeWork(agentId)) return;
    emit({ type: "agent", agent: store.agents.setSuggestion(agentId, suggestion) });
  }

  async #runTurn(agentId: string, message: AgentMessage, signal: AbortSignal): Promise<void> {
    const { store, emit } = this.#deps;
    this.#setStatus(agentId, "running");
    const agent = store.agents.get(agentId);
    if (agent === undefined) return;
    const thisTurn = Symbol(agentId);
    this.#latestTurn.set(agentId, thisTurn);
    // The last turn's process may still hold the conversation open while it waits for a suggestion.
    await this.#endSuggestionWait(agentId);
    const [{ servers, claudeConnectors }, promptSuggestions] = await Promise.all([this.#deps.mcpConfig(), this.#deps.promptSuggestions()]);
    const suggestionWait = new AbortController();
    const allowed = (name: string) => agent.mcp === undefined || agent.mcp.includes(name);

    // What the session had used before this turn; a new session starts from nothing. A session
    // resumed from outside mothership has earlier use mothership never saw, so its first turn has none.
    const before = agent.sessionRef === undefined ? undefined : store.events.lastDoneTotals(agentId);
    const fresh = agent.sessionRef === undefined;

    let output: string | undefined;
    let failure: string | undefined;
    /** An agent terminated from outside: a failure only if mothership is not stopping (decided below). */
    let terminated: Extract<AgentEvent, { type: "error" }> | undefined;
    for await (const reported of ADAPTERS[agent.provider].run({
      prompt: this.#prompt(agent, message),
      sessionRef: agent.sessionRef,
      model: agent.model,
      effort: agent.effort,
      mcpServers: [this.#controlServer(agent), ...servers.filter((s) => allowed(s.name))],
      claudeConnectors: [...claudeConnectors].filter(([name]) => allowed(name)).map(([, connector]) => connector),
      workingDirectory: agent.workingDirectory,
      allowShell: agent.worktree?.state === "active",
      allowGit: agent.allowGit && AGENT_CAPABILITIES[agent.provider].gitAccess,
      approve: (action, approvalSignal) => this.#deps.approve(agentId, action, approvalSignal),
      signal,
      promptSuggestions,
      onSuggestion: (suggestion) => void this.#suggest(agentId, thisTurn, suggestion),
      suggestionSignal: suggestionWait.signal,
      onSuggestionWait: (finished) => {
        const wait = { controller: suggestionWait, finished: finished.catch(() => undefined) };
        this.#suggestionWaits.set(agentId, wait);
        void wait.finished.then(() => {
          if (this.#suggestionWaits.get(agentId) === wait) this.#suggestionWaits.delete(agentId);
        });
        // Stopped or shut down while the turn was ending: nothing should outlive it.
        if (this.#shuttingDown || signal.aborted) suggestionWait.abort();
      },
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
      if (event.type === "error" && isTerminationExit(event.message)) {
        terminated = event;
        failure = event.message;
        continue;
      }
      emit({ type: "event", record: store.events.insert(agentId, event) });
      if (event.type === "done") output = event.output;
      if (event.type === "error") failure = event.message;
    }

    if (terminated !== undefined && !this.#shuttingDown && !signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, TERMINATION_GRACE_MS).unref());
    }
    const outcome = turnOutcome({ aborted: signal.aborted, shuttingDown: this.#shuttingDown, finished: output !== undefined });
    if (terminated !== undefined && outcome === "failed") emit({ type: "event", record: store.events.insert(agentId, terminated) });
    this.#end(agentId, message, outcome, output, failure);
  }
}
