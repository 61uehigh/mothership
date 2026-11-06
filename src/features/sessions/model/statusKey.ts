import type { Agent } from "@/features/sessions/model/Agent";

/**
 * ### StatusKey
 *
 * A session's status as the screens name it (`sessions.status.<key>`).
 */
export type StatusKey = "needsYou" | "working" | "failed" | "stoppedByRestart" | "stopped" | "idle" | "done";

/**
 * ### statusKey
 *
 * Which status a session shows. An open question wins unless a turn is
 * running; an idle session is `done` once it has answered and `idle` before.
 *
 * @param answered - It has finished a turn (or has a provider conversation).
 * @param waiting - It has an open question to you.
 */
export function statusKey(agent: Pick<Agent, "status" | "stoppedByRestart">, { answered, waiting }: { answered: boolean; waiting: boolean }): StatusKey {
  if (agent.status === "running") return "working";
  if (waiting) return "needsYou";
  if (agent.status === "failed") return "failed";
  if (agent.status === "interrupted") return agent.stoppedByRestart ? "stoppedByRestart" : "stopped";
  return answered ? "done" : "idle";
}
