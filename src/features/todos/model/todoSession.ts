import type { Agent, AgentQuestion } from "@/features/sessions/model/Agent";

/**
 * ### TodoSessionState
 *
 * How the session linked to a to-do is doing, as shown next to it.
 * - `none`: no session yet.
 * - `missing`: the session was deleted.
 * - `needs-you`: it or one of its sub-agents asked you something.
 * - `working`: a turn is running (its own or a sub-agent's).
 * - `done`: the last turn finished.
 * - `failed` / `stopped`: the last turn ended with an error, or was stopped.
 */
export type TodoSessionState = "none" | "missing" | "needs-you" | "working" | "done" | "failed" | "stopped";

/**
 * ### todoSessionState
 *
 * @param sessionId - The to-do's `sessionId`.
 * @param agents - Every agent the page knows of; only trusted to be complete once loaded.
 * @param questions - Questions agents asked; open ones mean the session needs you.
 * @returns The state of the to-do's session.
 */
export function todoSessionState(sessionId: string | undefined, agents: ReadonlyArray<Agent>, questions: ReadonlyArray<AgentQuestion>): TodoSessionState {
  if (sessionId === undefined) return "none";
  const lead = agents.find((a) => a.id === sessionId);
  if (lead === undefined) return "missing";
  // The lead and every agent it started, however deep.
  const family = new Set([lead.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const agent of agents) {
      if (agent.parentId !== undefined && family.has(agent.parentId) && !family.has(agent.id)) {
        family.add(agent.id);
        grew = true;
      }
    }
  }
  if (questions.some((q) => q.status === "open" && family.has(q.agentId))) return "needs-you";
  if (agents.some((a) => family.has(a.id) && a.status === "running")) return "working";
  if (lead.status === "failed") return "failed";
  if (lead.status === "interrupted") return "stopped";
  return "done";
}
