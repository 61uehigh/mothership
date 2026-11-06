import { describe, expect, it } from "vitest";
import type { UsageTotals } from "@/features/sessions/model/AgentEvents";
import { MAX_CONCURRENT_TURNS, mayStartTurn, turnUsage, type TurnSlot } from "@/features/sessions/server/runtime/turnRules";

const free: TurnSlot = { shuttingDown: false, running: false, paused: false, waitsForContinue: false, busy: false, canTakeWork: true, runningTurns: 0 };

describe("mayStartTurn", () => {
  it("starts turns up to the cap across all agents, and one more waits for a free slot", () => {
    expect(mayStartTurn({ ...free, runningTurns: MAX_CONCURRENT_TURNS - 1 })).toBe(true);
    expect(mayStartTurn({ ...free, runningTurns: MAX_CONCURRENT_TURNS })).toBe(false);
  });

  it("keeps a stopped agent's queue waiting until new work lifts the pause", () => {
    expect(mayStartTurn({ ...free, paused: true })).toBe(false);
  });

  it("keeps the queue of an agent a restart stopped waiting for Continue, whichever turn frees a slot", () => {
    expect(mayStartTurn({ ...free, waitsForContinue: true })).toBe(false);
  });

  it("runs one turn per agent and none while a worktree operation holds it", () => {
    expect(mayStartTurn({ ...free, running: true })).toBe(false);
    expect(mayStartTurn({ ...free, busy: true })).toBe(false);
  });

  it("starts nothing once mothership is stopping or the agent has nowhere to work", () => {
    expect(mayStartTurn({ ...free, shuttingDown: true })).toBe(false);
    expect(mayStartTurn({ ...free, canTakeWork: false })).toBe(false);
  });
});

const totals = (inputTokens: number, costUsd: number): UsageTotals => ({ inputTokens, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd, billing: "api" });

describe("turnUsage", () => {
  it("subtracts the totals before the turn from those after it", () => {
    expect(turnUsage(totals(150, 0.5), totals(100, 0.25), false)).toEqual({ ...totals(50, 0.25), outputTokens: 0 });
  });

  it("counts everything for a turn that started a new session", () => {
    expect(turnUsage(totals(150, 0.5), undefined, true)).toEqual(totals(150, 0.5));
  });

  it("gives no answer when the earlier totals are unknown or went backwards", () => {
    expect(turnUsage(totals(150, 0.5), undefined, false)).toBeUndefined();
    expect(turnUsage(totals(50, 0.5), totals(100, 0.25), false)).toBeUndefined();
    expect(turnUsage(undefined, totals(100, 0.25), false)).toBeUndefined();
  });
});
