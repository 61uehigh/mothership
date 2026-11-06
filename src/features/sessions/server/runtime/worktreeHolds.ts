import path from "node:path";
import type { Agent } from "@/features/sessions/model/Agent";

/**
 * ### WorktreeHold
 *
 * A merge, discard, or delete in progress.
 *
 * @property agentId - The agent the operation is on.
 * @property folder - Its active worktree's folder, or `undefined` when it has
 *   none (deleting a session without a worktree holds only the session).
 */
export type WorktreeHold = { agentId: string; folder: string | undefined };

/**
 * ### isInsideFolder
 *
 * @returns Whether `dir` is `folder` or lies below it.
 */
export function isInsideFolder(dir: string, folder: string, separator: string = path.sep): boolean {
  return dir === folder || dir.startsWith(`${folder}${separator}`);
}

/**
 * ### isHeldByWorktreeOperation
 *
 * Decides which agents a merge, discard, or delete holds: the agent the
 * operation is on, and every agent without a worktree of its own that works
 * inside the folder being merged or removed (sub-agents a lead started
 * there, including one spawned mid-operation). A held agent starts no turn,
 * so none begins in a folder that is about to disappear.
 */
export function isHeldByWorktreeOperation(
  agent: Pick<Agent, "id" | "workingDirectory" | "worktree">,
  holds: Iterable<WorktreeHold>,
  separator: string = path.sep,
): boolean {
  for (const hold of holds) {
    if (hold.agentId === agent.id) return true;
    if (hold.folder !== undefined && agent.worktree === undefined && isInsideFolder(agent.workingDirectory, hold.folder, separator)) return true;
  }
  return false;
}
