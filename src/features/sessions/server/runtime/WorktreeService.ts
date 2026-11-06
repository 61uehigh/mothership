import path from "node:path";
import type { Agent, LiveUpdate, Worktree } from "@/features/sessions/model/Agent";
import type { AgentStore } from "@/features/sessions/server/AgentStore";
import { createWorktree, mergeWorktree, removeWorktree, worktreeDiff } from "@/features/sessions/server/runtime/worktreeGit";
import { RuntimeLimitError } from "@/features/sessions/server/runtime/RuntimeLimitError";
import type { TurnScheduler } from "@/features/sessions/server/runtime/TurnScheduler";

/**
 * ### WorktreeServiceDeps
 *
 * What {@link WorktreeService} needs from the runtime around it.
 */
export type WorktreeServiceDeps = {
  /** Agents' rows, and deleting an agent with everything it owns. */
  store: Pick<AgentStore, "agents" | "deleteAgent">;
  scheduler: TurnScheduler;
  /** Broadcasts a state change to subscribers. */
  emit: (update: LiveUpdate) => void;
  /** Where agent worktrees are created. */
  worktreesDir: string;
};

type WorktreeAgent = Agent & { worktree: Worktree };

/**
 * ### WorktreeService
 *
 * Operations on an agent's git worktree (create, diff, merge, discard) plus
 * deleting a session, which may discard its worktree. Merge, discard, and
 * delete hold the agent exclusively: no turn starts and no second such
 * operation runs until they finish. They never remove a folder under a
 * running turn; they stop it and wait through the {@link TurnScheduler}.
 */
export class WorktreeService {
  readonly #deps: WorktreeServiceDeps;
  /** Agents in the middle of a merge, discard, or delete. */
  readonly #busy = new Set<string>();

  constructor(deps: WorktreeServiceDeps) {
    this.#deps = deps;
  }

  /**
   * ### isBusy
   *
   * @returns Whether a merge, discard, or delete of the agent is in progress.
   */
  isBusy(agentId: string): boolean {
    return this.#busy.has(agentId);
  }

  /**
   * ### create
   *
   * @param name - Agent name; a slug of it names the branch and folder.
   * @returns A new active worktree of `repo`.
   * @throws `GitError` When `repo` is not a git repository or git refuses.
   */
  create(repo: string, name: string): Promise<Worktree> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "agent";
    return createWorktree(repo, this.#deps.worktreesDir, slug);
  }

  /**
   * ### abandon
   *
   * Best-effort removal of a worktree no agent was recorded for (rolling back
   * a failed create). Never throws.
   */
  async abandon(worktree: Worktree): Promise<void> {
    await removeWorktree(worktree, false).catch(() => undefined);
  }

  /**
   * ### diff
   *
   * @returns Unified diff of everything the agent changed since its base commit.
   * @throws {@link RuntimeLimitError} When the agent has no active worktree.
   * @throws `GitError` When git fails.
   */
  async diff(agentId: string): Promise<string> {
    return worktreeDiff(this.#worktreeAgent(agentId).worktree);
  }

  /**
   * ### merge
   *
   * Merges the agent's work into its base branch, removes the worktree, and,
   * for a comparison group, discards the other attempts.
   *
   * @param message - Commit message for the agent's uncommitted work.
   * @returns The merge commit id.
   * @throws {@link RuntimeLimitError} When the agent has no active worktree, is
   *   running, or another operation holds it.
   * @throws `GitError` When git refuses (see `mergeWorktree`).
   */
  async merge(agentId: string, message: string): Promise<string> {
    const { store, scheduler, emit } = this.#deps;
    const { commit, compareGroup } = await this.#exclusive(agentId, async () => {
      const agent = this.#worktreeAgent(agentId);
      if ([agentId, ...this.#occupants(agent.worktree.path)].some((id) => scheduler.isRunning(id))) {
        throw new RuntimeLimitError("Cannot merge while the agent or one of its sub-agents is working. Merge after they finish or are stopped.");
      }
      const merged = await mergeWorktree(agent.worktree, message);
      // The work is on the base branch now: record that before cleaning up, so a failed cleanup can't undo it.
      emit({ type: "agent", agent: store.agents.setWorktreeState(agentId, "merged") });
      await removeWorktree(agent.worktree, true).catch((error: unknown) => {
        console.error(`[mothership] merged ${agent.worktree.branch}, but could not remove its worktree:`, error);
      });
      return { commit: merged, compareGroup: agent.compareGroup };
    });
    if (compareGroup !== undefined) {
      for (const other of store.agents.list()) {
        if (other.id !== agentId && other.compareGroup === compareGroup && other.worktree?.state === "active") {
          // The merge already happened; one attempt that can't be discarded must not report it as failed.
          await this.discard(other.id).catch((error: unknown) => console.error(`[mothership] could not discard attempt ${other.id}:`, error));
        }
      }
    }
    return commit;
  }

  /**
   * ### discard
   *
   * Stops the agent if it is running, then deletes its worktree and branch.
   *
   * @throws {@link RuntimeLimitError} When the agent has no active worktree or another operation holds it.
   * @throws `GitError` When git fails.
   */
  async discard(agentId: string): Promise<void> {
    await this.#exclusive(agentId, () => this.#discardWorktree(agentId));
  }

  /**
   * ### deleteAgent
   *
   * Permanently deletes the session and its history. An active worktree is
   * discarded first (its unmerged work is lost); open questions go with it.
   *
   * @throws {@link RuntimeLimitError} While a turn is running or another operation holds the agent.
   * @throws `GitError` When the worktree cannot be removed.
   */
  async deleteAgent(agentId: string): Promise<void> {
    const { store, scheduler, emit } = this.#deps;
    await this.#exclusive(agentId, async () => {
      const agent = store.agents.get(agentId);
      if (agent === undefined) return;
      if (scheduler.isRunning(agentId)) throw new RuntimeLimitError("Stop the running turn before deleting this session.");
      if (agent.worktree?.state === "active") await this.#discardWorktree(agentId);
      store.deleteAgent(agentId);
      scheduler.forget(agentId);
      emit({ type: "agentDeleted", agentId });
    });
  }

  /** Runs a merge, discard, or delete with no turn and no other such operation on the agent meanwhile. */
  async #exclusive<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
    if (this.#busy.has(agentId)) throw new RuntimeLimitError("Another merge, discard, or delete of this session is still in progress.");
    this.#busy.add(agentId);
    try {
      return await operation();
    } finally {
      this.#busy.delete(agentId);
      // Turns held back during the operation may start now (a no-op once the worktree is gone).
      this.#deps.scheduler.pump(agentId);
    }
  }

  /** Other agents working inside a worktree folder: sub-agents a lead started there. */
  #occupants(worktreePath: string): Array<string> {
    const inside = (dir: string) => dir === worktreePath || dir.startsWith(`${worktreePath}${path.sep}`);
    return this.#deps.store.agents
      .list()
      .filter((a) => a.worktree === undefined && inside(a.workingDirectory))
      .map((a) => a.id);
  }

  #worktreeAgent(agentId: string): WorktreeAgent {
    const agent = this.#deps.store.agents.get(agentId);
    if (agent?.worktree === undefined) throw new RuntimeLimitError("This agent has no separate working folder (worktree)");
    if (agent.worktree.state !== "active") throw new RuntimeLimitError("This working folder has already been merged or discarded");
    return { ...agent, worktree: agent.worktree };
  }

  async #discardWorktree(agentId: string): Promise<void> {
    const { store, scheduler, emit } = this.#deps;
    const agent = this.#worktreeAgent(agentId);
    // The agent and any sub-agents working in its folder; let their processes exit before the folder disappears.
    const working = [agentId, ...this.#occupants(agent.worktree.path)];
    for (const id of working) scheduler.stop(id);
    await Promise.all(working.map((id) => scheduler.whenIdle(id)));
    await removeWorktree(agent.worktree, false);
    emit({ type: "agent", agent: store.agents.setWorktreeState(agentId, "discarded") });
  }
}
