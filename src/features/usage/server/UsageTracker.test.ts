import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ reads: 0 }));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => {
    sdk.reads++;
    return {
      async *[Symbol.asyncIterator]() {},
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          rate_limits_available: true,
          subscription_type: "max",
          rate_limits: { five_hour: { utilization: 10 }, seven_day: { utilization: 20 }, model_scoped: [{ display_name: "Fable", utilization: 30 }] },
        };
      },
      close: () => {},
    };
  },
}));

const { UsageTracker, claudeReadDue } = await import("@/features/usage/server/UsageTracker");

describe("claudeReadDue", () => {
  const minute = 60_000;
  it("reads again five minutes after the last read", () => {
    expect(claudeReadDue(4 * minute, undefined, false)).toBe(false);
    expect(claudeReadDue(5 * minute, undefined, false)).toBe(true);
    expect(claudeReadDue(5 * minute, "probe-timeout", false)).toBe(true);
  });

  it("waits an hour after a read that showed the login has no plan limits or was refused", () => {
    expect(claudeReadDue(30 * minute, "claude-no-limits", false)).toBe(false);
    expect(claudeReadDue(30 * minute, "claude-login", true)).toBe(false);
    expect(claudeReadDue(60 * minute, "claude-no-limits", false)).toBe(true);
  });

  it("goes back to five minutes once another call to Claude got through after a refused login", () => {
    expect(claudeReadDue(5 * minute, "claude-login", false)).toBe(true);
  });
});

describe("UsageTracker", () => {
  beforeEach(() => {
    sdk.reads = 0;
  });

  it("starts one Claude Code read for overlapping probes and a snapshot", async () => {
    const tracker = new UsageTracker();
    await Promise.all([tracker.probeClaude(), tracker.probeClaude(), tracker.snapshot()]);
    expect(sdk.reads).toBe(1);
  });

  it("keeps the per-model windows after a rate_limit_event, and the event does not put off the next full read", async () => {
    const tracker = new UsageTracker();
    await tracker.probeClaude();
    tracker.recordClaude({ unifiedWindows: { five_hour: { utilization: 0.5 } } });
    const { claude } = await tracker.snapshot();
    expect(claude?.windows.map((x) => [x.id, x.usedPercent])).toEqual([
      ["five_hour", 50],
      ["seven_day", 20],
      ["model_fable", 30],
    ]);
    expect(sdk.reads).toBe(1);
  });
});
