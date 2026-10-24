import { randomBytes, randomUUID } from "node:crypto";
import type { Agent, AgentEventRecord, AgentLink, AgentMessage, AgentQuestion, LiveUpdate, MessageKind } from "@/features/sessions/model/Agent";
import type { AgentKind, Effort } from "@/features/sessions/model/AgentEvents";
import type { AgentStore } from "@/features/sessions/server/AgentStore";
import { repoRoot } from "@/platform/git";
import { RuntimeLimitError } from "@/features/sessions/server/runtime/RuntimeLimitError";
import { REPORT_MAX_CHARS, truncate, TurnScheduler, type RuntimeEnvironment } from "@/features/sessions/server/runtime/TurnScheduler";
import { QuestionDesk } from "@/features/sessions/server/runtime/QuestionDesk";
import { WorktreeService } from "@/features/sessions/server/runtime/WorktreeService";
import type { HistoryItem, ImportableSession } from "@/features/sessions/model/Import";
import { nativeSubagents, type NativeSubagent } from "@/features/sessions/model/Subagents";

export { RuntimeLimitError } from "@/features/sessions/server/runtime/RuntimeLimitError";

/** A human-created agent is depth 0; its sub-agents 1, and so on. */
const MAX_DEPTH = 3;
const MAX_CHILDREN_PER_AGENT = 8;
/** Circuit breaker for agent-to-agent messages, per sender → recipient pair. */
const MESSAGE_LIMIT = { count: 20, windowMs: 10 * 60_000 };

/**
 * ### NewAgent
 *
 * Input for {@link AgentRuntime.createAgent}.
 */
export type NewAgent = {
  name: string;
  role: string | undefined;
  provider: AgentKind;
  model: string | undefined;
  effort: Effort | undefined;
  parentId: string | undefined;
  mcp: Array<string> | undefined;
  /** Sent as the first message when non-empty. */
  initialMessage: string | undefined;
  /** Directory to work in; `undefined` uses the default folder. */
  repo: string | undefined;
  /** Work in a new git worktree of `repo` instead of in `repo` itself. */
  worktree: boolean;
  /** Groups agents trying the same task for comparison. */
  compareGroup: string | undefined;
  /** Let it run `git` (see `Agent.allowGit`); off when omitted. */
  allowGit?: boolean;
};

/**
 * ### AgentSummary
 *
 * What an agent sees about another agent through the mothership tools.
 */
export type AgentSummary = Pick<
  Agent,
  "id" | "name" | "role" | "provider" | "model" | "status" | "parentId" | "statusNote" | "links"
> & {
  /** Output of the agent's most recent finished turn, truncated. */
  lastOutput: string | undefined;
  queuedMessages: number;
};

/**
 * ### RuntimeDeps
 *
 * What the runtime is built from.
 */
export type RuntimeDeps = {
  /** Persistence; agents it reports as `running` become `interrupted`. */
  store: AgentStore;
  /** The folder a new session works in when none is given (read on each use, so a change in Settings applies at once). */
  defaultFolder: () => Promise<string>;
  /** Where agent worktrees are created. */
  worktreesDir: string;
  /** Where agents' mothership MCP servers reach this app. */
  baseUrl: string;
  environment: RuntimeEnvironment;
};

/**
 * ### AgentRuntime
 *
 * The façade routes use (the composition root builds the one instance). It
 * creates agents and answers the operations humans and agents perform, and
 * delegates the rest:
 * - {@link TurnScheduler}: message queues and the turn loop.
 * - {@link WorktreeService}: diff, merge, discard, and delete, which hold an
 *   agent exclusively and coordinate with the scheduler.
 * - {@link QuestionDesk}: questions to you and command approvals.
 *
 * Every state change is broadcast as a {@link LiveUpdate}.
 */
export class AgentRuntime {
  readonly #store: AgentStore;
  readonly #scheduler: TurnScheduler;
  readonly #worktrees: WorktreeService;
  readonly #questions: QuestionDesk;
  /** Sub-agents being created, by parent, so parallel spawns can't exceed the limit. */
  readonly #spawning = new Map<string, number>();
  readonly #listeners = new Set<(update: LiveUpdate) => void>();
  readonly #messageLog = new Map<string, Array<number>>();
  readonly #defaultFolder: () => Promise<string>;

  constructor({ store, defaultFolder, worktreesDir, baseUrl, environment }: RuntimeDeps) {
    this.#store = store;
    this.#defaultFolder = defaultFolder;
    const emit = (update: LiveUpdate) => this.#emit(update);
    // The scheduler asks the worktree service lazily; both exist before any turn runs.
    this.#scheduler = new TurnScheduler({
      ...environment,
      store,
      emit,
      baseUrl,
      isBusy: (id) => this.#worktrees.isBusy(id),
      approve: (agentId, command, signal) => this.#questions.approve(agentId, command, signal),
    });
    this.#questions = new QuestionDesk({
      questions: store.questions,
      emit,
      subscribe: (listener) => this.subscribe(listener),
      canTakeWork: (agentId) => this.#scheduler.canTakeWork(agentId),
      tell: (agentId, text) => this.sendMessage(agentId, text, undefined, "system"),
    });
    this.#worktrees = new WorktreeService({ store, scheduler: this.#scheduler, emit, worktreesDir });
    store.agents.interruptRunning();
  }

  /**
   * ### subscribe
   *
   * @param listener - Called for every update until the returned function is called.
   * @returns Unsubscribe function.
   */
  subscribe(listener: (update: LiveUpdate) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * ### snapshot
   *
   * @returns All agents and messages, plus open and recent questions, for the initial page load.
   */
  snapshot(): { agents: Array<Agent>; messages: Array<AgentMessage>; questions: Array<AgentQuestion> } {
    return {
      agents: this.#store.agents.list(),
      messages: this.#store.messages.list(undefined),
      questions: this.#store.questions.list(),
    };
  }

  /**
   * ### get
   *
   * One row read, without history; use it for existence checks.
   *
   * @returns The agent, or `undefined` if it does not exist.
   */
  get(id: string): Agent | undefined {
    return this.#store.agents.get(id);
  }

  /**
   * ### detail
   *
   * @returns One agent's full history, or `undefined` if it does not exist.
   */
  detail(id: string): { agent: Agent; messages: Array<AgentMessage>; events: Array<AgentEventRecord> } | undefined {
    const agent = this.#store.agents.get(id);
    if (agent === undefined) return undefined;
    return { agent, messages: this.#store.messages.list(id), events: this.#store.events.list(id) };
  }

  /**
   * ### createAgent
   *
   * @param initialSender - Who the first message is from; an agent here gets
   *   the new agent's result reported back.
   * @returns The created agent.
   * @throws Error When `parentId` names an unknown agent.
   * @throws `GitError` When a worktree is requested but `repo` is not a git repository.
   */
  async createAgent(input: NewAgent, initialSender: string | undefined = undefined): Promise<Agent> {
    if (input.parentId !== undefined && this.#store.agents.get(input.parentId) === undefined) {
      throw new Error(`Unknown parent agent ${input.parentId}`);
    }
    const repo = input.repo ?? (await this.#defaultFolder());
    const worktree = input.worktree ? await this.#worktrees.create(repo, input.name) : undefined;
    const now = Date.now();
    const agent: Agent = {
      id: randomUUID(),
      name: input.name,
      role: input.role,
      provider: input.provider,
      model: input.model,
      effort: input.effort,
      parentId: input.parentId,
      status: "idle",
      sessionRef: undefined,
      workingDirectory: worktree?.path ?? repo,
      mcp: input.mcp,
      createdAt: now,
      lastActivityAt: now,
      statusNote: undefined,
      links: [],
      worktree,
      compareGroup: input.compareGroup,
      archivedAt: undefined,
      allowGit: input.allowGit === true && input.provider === "claude",
    };
    try {
      this.#store.agents.insert(agent, randomBytes(24).toString("hex"));
    } catch (error) {
      if (worktree !== undefined) await this.#worktrees.abandon(worktree);
      throw error;
    }
    this.#emit({ type: "agent", agent });
    if (input.initialMessage !== undefined && input.initialMessage.trim() !== "") {
      this.sendMessage(agent.id, input.initialMessage, initialSender);
    }
    return agent;
  }

  /**
   * ### nativeSubagents
   *
   * @returns The sub-agents each session's provider ran on its own (Claude's
   *   Agent tool), by session id; sessions without any are left out.
   */
  nativeSubagents(): Record<string, Array<NativeSubagent>> {
    const byAgent = new Map<string, Array<AgentEventRecord>>();
    for (const record of this.#store.events.subagentEvents()) byAgent.set(record.agentId, [...(byAgent.get(record.agentId) ?? []), record]);
    const out: Record<string, Array<NativeSubagent>> = {};
    for (const [agentId, events] of byAgent) {
      out[agentId] = nativeSubagents(events, this.#store.agents.get(agentId)?.status === "running");
    }
    return out;
  }

  /**
   * ### importSession
   *
   * Brings a Claude Code or Codex session from this Mac into mothership as a
   * lead session that continues it. A Claude session is forked first, so the
   * original stays untouched in Claude Code; Codex has no fork, so the same
   * thread continues (avoid using it in both places at once). The earlier
   * conversation is copied in as read-only history; the next message you send
   * starts the first mothership turn, with mothership's briefing.
   *
   * @param session - From `listImportable`.
   * @param history - From `readHistory`.
   * @param sessionRef - The session to resume: the fork for Claude, the thread id for Codex.
   * @returns The new session.
   */
  async importSession(session: ImportableSession, history: Array<HistoryItem>, sessionRef: string): Promise<Agent> {
    const workingDirectory = session.cwd ?? (await this.#defaultFolder());
    const now = Date.now();
    const agent: Agent = {
      id: randomUUID(),
      name: session.title,
      role: "lead",
      provider: session.provider,
      model: undefined,
      effort: undefined,
      parentId: undefined,
      status: "idle",
      sessionRef,
      workingDirectory,
      mcp: undefined,
      createdAt: now,
      lastActivityAt: now,
      statusNote: undefined,
      links: [],
      worktree: undefined,
      compareGroup: undefined,
      archivedAt: undefined,
      allowGit: false,
    };
    this.#store.agents.insert(agent, randomBytes(24).toString("hex"));
    const source = session.provider === "claude" ? "Claude Code" : "Codex";
    const note: HistoryItem = {
      kind: "note",
      text:
        session.provider === "claude"
          ? `Imported from ${source}. Everything above is the earlier conversation; mothership continues a copy (fork), so the original session in ${source} is unchanged.`
          : `Imported from ${source}. Everything above is the earlier conversation; mothership continues the same Codex thread, so avoid using it in Codex at the same time.`,
    };
    // History sits just before now, so it reads first and new messages follow it.
    this.#store.insertHistory(agent.id, [...history, note], now - history.length - 2);
    this.#emit({ type: "agent", agent });
    return agent;
  }

  /**
   * ### sendMessage
   *
   * Queues a message and starts a turn when the agent and a run slot are free.
   *
   * @param senderId - Sending agent, or `undefined` for the human or mothership.
   * @param kind - See {@link MessageKind}.
   * @returns The queued message.
   * @throws Error When the agent does not exist.
   * @throws {@link RuntimeLimitError} When the agent's worktree was merged or discarded.
   */
  sendMessage(agentId: string, text: string, senderId: string | undefined, kind: MessageKind = "message"): AgentMessage {
    return this.#scheduler.enqueue(agentId, text, senderId, kind);
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
    return this.#scheduler.stop(agentId);
  }

  // ── Operations agents call through their mothership MCP server ──────────

  /**
   * ### agentIdForToken
   *
   * @returns The agent a control token belongs to, or `undefined`.
   */
  agentIdForToken(token: string): string | undefined {
    return this.#store.tokens.agentFor(token);
  }

  /**
   * ### summaries
   *
   * @returns Every agent as other agents see it.
   */
  summaries(): Array<AgentSummary> {
    const queued = this.#store.messages.queuedCounts(undefined);
    return this.#store.agents.list().map((agent) => this.#summary(agent, queued.get(agent.id) ?? 0));
  }

  /**
   * ### summary
   *
   * @returns One agent as other agents see it, or `undefined` if it does not exist.
   */
  summary(agentId: string): AgentSummary | undefined {
    const agent = this.#store.agents.get(agentId);
    if (agent === undefined) return undefined;
    return this.#summary(agent, this.#store.messages.queuedCounts(agentId).get(agentId) ?? 0);
  }

  #summary(agent: Agent, queuedMessages: number): AgentSummary {
    const lastOutput = this.#store.events.lastDoneOutput(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      provider: agent.provider,
      model: agent.model,
      status: agent.status,
      parentId: agent.parentId,
      statusNote: agent.statusNote,
      links: agent.links,
      lastOutput: lastOutput === undefined ? undefined : truncate(lastOutput, REPORT_MAX_CHARS),
      queuedMessages,
    };
  }

  /**
   * ### spawn
   *
   * Creates a sub-agent of `parentId` and sends it `task`; the result is
   * reported back to the parent when the sub-agent's turn ends.
   *
   * Sub-agents work in the parent's folder (inside its worktree when it has
   * one) and can use only MCP servers the parent can.
   *
   * @returns The new agent.
   * @throws {@link RuntimeLimitError} Beyond the depth or child-count limit.
   */
  async spawn(
    parentId: string,
    input: Omit<NewAgent, "parentId" | "initialMessage" | "repo" | "compareGroup">,
    task: string,
  ): Promise<Agent> {
    let depth = 0;
    for (let a = this.#store.agents.get(parentId); a?.parentId !== undefined; a = this.#store.agents.get(a.parentId)) depth++;
    if (depth + 1 > MAX_DEPTH) {
      throw new RuntimeLimitError(`Sub-agents can only be nested ${MAX_DEPTH} levels deep. Handle this yourself or hand it to your parent agent.`);
    }
    // Spawns still being created count too: an agent may ask for several at once.
    const pending = this.#spawning.get(parentId) ?? 0;
    if (this.#store.agents.countChildren(parentId) + pending >= MAX_CHILDREN_PER_AGENT) {
      throw new RuntimeLimitError(`An agent can create at most ${MAX_CHILDREN_PER_AGENT} sub-agents. Use message_agent to hand this to an existing agent.`);
    }
    const parent = this.#store.agents.get(parentId);
    if (parent === undefined) throw new Error(`Unknown agent ${parentId}`);
    // A sub-agent never gets more than its parent: tools are limited to the
    // parent's servers, and it works in the parent's folder, so a parent in a
    // worktree keeps its sub-agents' edits inside that worktree (and its diff).
    const mcp = parent.mcp === undefined ? input.mcp : (input.mcp ?? parent.mcp).filter((name) => parent.mcp?.includes(name));
    this.#spawning.set(parentId, pending + 1);
    try {
      return await this.createAgent(
        { ...input, mcp, parentId, initialMessage: task, repo: parent.workingDirectory, compareGroup: undefined },
        parentId,
      );
    } finally {
      const left = (this.#spawning.get(parentId) ?? 1) - 1;
      if (left <= 0) this.#spawning.delete(parentId);
      else this.#spawning.set(parentId, left);
    }
  }

  /**
   * ### messageFromAgent
   *
   * @returns The queued message.
   * @throws {@link RuntimeLimitError} When the pair exceeds the message rate limit.
   * @throws Error When the recipient does not exist.
   */
  messageFromAgent(senderId: string, recipientId: string, text: string): AgentMessage {
    if (senderId === recipientId) throw new RuntimeLimitError("You cannot send a message to yourself.");
    const key = `${senderId}→${recipientId}`;
    const now = Date.now();
    const recent = (this.#messageLog.get(key) ?? []).filter((t) => now - t < MESSAGE_LIMIT.windowMs);
    if (recent.length >= MESSAGE_LIMIT.count) {
      throw new RuntimeLimitError("You have sent too many messages to this agent. Wait a while, or check with the human via ask_human.");
    }
    this.#messageLog.set(key, [...recent, now]);
    return this.sendMessage(recipientId, text, senderId);
  }

  /**
   * ### askHuman
   *
   * @returns The open question, now in the human's inbox.
   */
  askHuman(agentId: string, question: string, options: Array<string>): AgentQuestion {
    return this.#questions.ask(agentId, question, options);
  }

  /**
   * ### setAllowGit
   *
   * Turns git access on or off for a session (see `Agent.allowGit`). Applies
   * from its next turn.
   *
   * @throws {@link RuntimeLimitError} For a provider other than Claude.
   */
  setAllowGit(agentId: string, allowed: boolean): Agent {
    const agent = this.#store.agents.get(agentId);
    if (agent === undefined) throw new Error(`Unknown agent ${agentId}`);
    if (allowed && agent.provider !== "claude") throw new RuntimeLimitError("Git access is available for Claude sessions only.");
    const updated = this.#store.agents.setAllowGit(agentId, allowed);
    this.#emit({ type: "agent", agent: updated });
    return updated;
  }

  /**
   * ### updateProfile
   *
   * @returns The updated agent.
   */
  updateProfile(agentId: string, patch: { statusNote?: string; addLink?: AgentLink }): Agent {
    const current = this.#store.agents.get(agentId);
    if (current === undefined) throw new Error(`Unknown agent ${agentId}`);
    const { addLink, statusNote } = patch;
    const agent = this.#store.agents.updateProfile(agentId, {
      // Only keys being changed: an explicit `undefined` would erase the stored value.
      ...(statusNote === undefined ? {} : { statusNote }),
      ...(addLink === undefined ? {} : { links: [...current.links.filter((l) => l.url !== addLink.url), addLink].slice(-6) }),
    });
    this.#emit({ type: "agent", agent });
    return agent;
  }

  // ── Operations the human performs ──────────────────────────────────────

  /**
   * ### diff
   *
   * @returns Unified diff of everything the agent changed since its base commit.
   * @throws {@link RuntimeLimitError} When the agent has no active worktree.
   * @throws `GitError` When git fails.
   */
  diff(agentId: string): Promise<string> {
    return this.#worktrees.diff(agentId);
  }

  /**
   * ### merge
   *
   * Merges the agent's work into its base branch, removes the worktree, and,
   * for a comparison group, discards the other attempts.
   *
   * @param message - Commit message for the agent's uncommitted work.
   * @returns The merge commit id.
   * @throws {@link RuntimeLimitError} When the agent has no active worktree or is running.
   * @throws `GitError` When git refuses (see `mergeWorktree`).
   */
  merge(agentId: string, message: string): Promise<string> {
    return this.#worktrees.merge(agentId, message);
  }

  /**
   * ### discard
   *
   * Stops the agent if it is running, then deletes its worktree and branch.
   *
   * @throws {@link RuntimeLimitError} When the agent has no active worktree.
   * @throws `GitError` When git fails.
   */
  discard(agentId: string): Promise<void> {
    return this.#worktrees.discard(agentId);
  }

  /**
   * ### deleteAgent
   *
   * Permanently deletes the session and its history. An active worktree is
   * discarded first (its unmerged work is lost); open questions go with it.
   *
   * @throws {@link RuntimeLimitError} While a turn is running.
   * @throws `GitError` When the worktree cannot be removed.
   */
  deleteAgent(agentId: string): Promise<void> {
    return this.#worktrees.deleteAgent(agentId);
  }

  /**
   * ### setArchived
   *
   * Hides the session from the list (or brings it back). Archiving stops a
   * running turn; the history and any worktree are kept.
   *
   * @returns The updated agent.
   * @throws Error When the agent does not exist.
   */
  setArchived(agentId: string, archived: boolean): Agent {
    if (archived) this.#scheduler.stop(agentId);
    const agent = this.#store.agents.setArchived(agentId, archived);
    this.#emit({ type: "agent", agent });
    return agent;
  }

  /**
   * ### repoFor
   *
   * @returns The git repository root for `dir`, or `undefined` when it is not in one.
   */
  async repoFor(dir: string | undefined): Promise<string | undefined> {
    return repoRoot(dir ?? (await this.#defaultFolder()));
  }

  /**
   * ### resolveQuestion
   *
   * Answers or dismisses an open question and tells the asking agent, which
   * starts a new turn for it.
   *
   * @param answer - The answer; `undefined` dismisses the question.
   * @returns The resolved question, or `undefined` when it does not exist or is not open.
   */
  resolveQuestion(questionId: string, answer: string | undefined): AgentQuestion | undefined {
    return this.#questions.resolve(questionId, answer);
  }

  #emit(update: LiveUpdate): void {
    // One broken subscriber (a closed stream) must not fail the turn or operation that emitted.
    for (const listener of this.#listeners) {
      try {
        listener(update);
      } catch (error) {
        console.error("[mothership] live update listener failed", error);
      }
    }
  }
}
