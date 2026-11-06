import type { Agent, AgentMessage, MessageKind } from "@/features/sessions/model/Agent";

/**
 * ### CONTINUE_NOTE
 *
 * What a session continued after a restart is told, so it picks up its work
 * instead of starting over.
 */
export const CONTINUE_NOTE =
  "Your previous turn was interrupted by an app restart. Continue where you left off: check what you had already done before repeating anything.";

/**
 * ### isTerminationExit
 *
 * Whether an agent's error says its process was terminated from outside
 * (SIGTERM, exit code 143 = 128 + 15), as when the app quits and stops
 * everything it started, rather than failing on its own.
 */
export function isTerminationExit(message: string): boolean {
  return /\b(code|status)\s*143\b|\bSIGTERM\b|\bsignal 15\b/i.test(message);
}

/**
 * ### TurnOutcome
 *
 * How a turn ended:
 * - `done`: it finished.
 * - `stopped`: you stopped it.
 * - `restart`: mothership stopped or restarted under it.
 * - `failed`: it ended with an error.
 */
export type TurnOutcome = "done" | "stopped" | "restart" | "failed";

/**
 * ### turnOutcome
 *
 * A turn that ends while mothership is shutting down was cut off by the
 * shutdown, whatever its process reported (a killed agent reports exit code
 * 143); it is not a failure and not your stop.
 *
 * @param aborted - The turn's signal was aborted.
 * @param shuttingDown - mothership has begun stopping.
 * @param finished - The provider reported the turn done.
 */
export function turnOutcome({ aborted, shuttingDown, finished }: { aborted: boolean; shuttingDown: boolean; finished: boolean }): TurnOutcome {
  if (shuttingDown && !finished) return "restart";
  if (aborted) return "stopped";
  return finished ? "done" : "failed";
}

/**
 * ### continueMessage
 *
 * The message that continues a session stopped by a restart. A session whose
 * provider conversation never started gets the message it was working on
 * again; any other is told {@link CONTINUE_NOTE}. Either way it comes from the
 * same sender as the interrupted turn's message, so a sub-agent's result is
 * still reported to the agent that gave it the work.
 *
 * @param interrupted - The message the interrupted turn was working on, if known.
 */
export function continueMessage(
  agent: Pick<Agent, "sessionRef">,
  interrupted: Pick<AgentMessage, "text" | "senderId" | "kind"> | undefined,
): { text: string; senderId: string | undefined; kind: MessageKind } {
  if (agent.sessionRef === undefined && interrupted !== undefined) return { text: interrupted.text, senderId: interrupted.senderId, kind: interrupted.kind };
  const fromAgent = interrupted?.kind === "message" && interrupted.senderId !== undefined;
  return fromAgent ? { text: CONTINUE_NOTE, senderId: interrupted.senderId, kind: "message" } : { text: CONTINUE_NOTE, senderId: undefined, kind: "system" };
}

/**
 * ### sessionsToContinue
 *
 * The sessions a restart stopped in `rootId`'s team: itself and the
 * sub-agents under it at any depth, parents first. A lead that was only
 * waiting for its sub-agents is not among them, but the sub-agents are, so
 * continuing a lead continues the work its team was doing.
 *
 * @returns Ids; empty when nothing in the team was stopped by a restart.
 */
export function sessionsToContinue(rootId: string, agents: ReadonlyArray<Pick<Agent, "id" | "parentId" | "stoppedByRestart" | "status">>): Array<string> {
  const out: Array<string> = [];
  const visit = (agent: Pick<Agent, "id" | "stoppedByRestart" | "status">) => {
    if (agent.stoppedByRestart && agent.status === "interrupted") out.push(agent.id);
    for (const child of agents) if (child.parentId === agent.id) visit(child);
  };
  const root = agents.find((agent) => agent.id === rootId);
  if (root !== undefined) visit(root);
  return out;
}

/**
 * ### restartRoots
 *
 * The leads (sessions without a parent) whose team a restart stopped:
 * continuing each of these continues everything a restart stopped.
 */
export function restartRoots(agents: ReadonlyArray<Pick<Agent, "id" | "parentId" | "stoppedByRestart" | "status">>): Array<string> {
  return agents.filter((agent) => agent.parentId === undefined && sessionsToContinue(agent.id, agents).length > 0).map((agent) => agent.id);
}

/**
 * ### continuationPlan
 *
 * How continuing `rootId`'s team treats each session a restart stopped. One
 * that already has a message waiting is only started (`start`): that message
 * picks the conversation up, and a continuation on top of it would repeat
 * work, as it would for a sub-agent whose task is sent again. Every other one
 * gets {@link continueMessage} (`send`). Either way the caller clears its
 * restart mark, so continuing the team again finds nothing left to continue.
 *
 * @param queued - Ids of sessions with undelivered messages.
 * @returns One step per session {@link sessionsToContinue} finds, parents first.
 */
export function continuationPlan(
  rootId: string,
  agents: ReadonlyArray<Pick<Agent, "id" | "parentId" | "stoppedByRestart" | "status">>,
  queued: ReadonlySet<string>,
): Array<{ id: string; action: "start" | "send" }> {
  return sessionsToContinue(rootId, agents).map((id) => ({ id, action: queued.has(id) ? "start" : "send" }));
}
