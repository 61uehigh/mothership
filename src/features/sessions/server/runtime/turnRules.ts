import type { TurnUsage, UsageTotals } from "@/features/sessions/model/AgentEvents";

/**
 * ### MAX_CONCURRENT_TURNS
 *
 * Turns running at once across all agents; the rest wait in their queues.
 */
export const MAX_CONCURRENT_TURNS = 6;

/**
 * ### TurnSlot
 *
 * What decides whether an agent's next queued turn may start now.
 */
export type TurnSlot = {
  /** mothership has begun stopping. */
  shuttingDown: boolean;
  /** The agent's own turn is in progress. */
  running: boolean;
  /** The human stopped the agent and no new message has arrived since. */
  paused: boolean;
  /** A restart stopped the agent and neither Continue nor a new message has picked it up since. */
  waitsForContinue: boolean;
  /** A merge, discard, or delete holds the agent. */
  busy: boolean;
  /** The agent exists and still has a working folder to work in. */
  canTakeWork: boolean;
  /** Turns running across all agents. */
  runningTurns: number;
};

/**
 * ### mayStartTurn
 *
 * @returns Whether the agent's next queued turn may start: one turn per agent,
 *   none while it is stopped (by you or a restart), held, or gone, and at most
 *   {@link MAX_CONCURRENT_TURNS} at once.
 */
export function mayStartTurn(slot: TurnSlot): boolean {
  if (slot.shuttingDown || slot.running || slot.paused || slot.waitsForContinue || slot.busy || !slot.canTakeWork) return false;
  return slot.runningTurns < MAX_CONCURRENT_TURNS;
}

/**
 * ### turnUsage
 *
 * What one turn used: the session's totals after it minus those before it.
 *
 * @param fresh - Whether the turn started a new session, so nothing came before it.
 * @returns `undefined` when the provider reports no totals, the earlier ones
 *   are unknown, or the totals went backwards.
 */
export function turnUsage(after: UsageTotals | undefined, before: UsageTotals | undefined, fresh: boolean): TurnUsage | undefined {
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
