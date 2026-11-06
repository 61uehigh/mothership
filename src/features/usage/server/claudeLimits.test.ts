import { describe, expect, it } from "vitest";
import type { LimitWindow } from "@/features/usage/model/Usage";
import { CLAUDE_LIMIT_CODE, PROBE_TIMEOUT_CODE, claudeUsageWindows, claudeWindows, mergeClaudeWindows, probeFailure } from "@/features/usage/server/claudeLimits";
import { CLAUDE_LOGIN_CODE } from "@/platform/claudeLogin";


describe("probeFailure", () => {
  it("turns an expired login into a 401 the browser can offer to log in for", () => {
    const failure = probeFailure(new Error("Failed to authenticate: OAuth session expired and could not be refreshed"), false);
    expect(failure).toMatchObject({ status: 401, code: CLAUDE_LOGIN_CODE, message: "Failed to authenticate: OAuth session expired and could not be refreshed" });
  });

  it("keeps Claude's own words, reset time included, for a used-up spend limit", () => {
    const failure = probeFailure(
      new Error(
        "Claude Code returned an error result: You've hit your org's monthly spend limit · run /usage-credits to ask your admin for a higher limit · your weekly limit resets 7am (Asia/Seoul)",
      ),
      false,
    );
    expect(failure.status).toBe(429);
    expect(failure.code).toBe(CLAUDE_LIMIT_CODE);
    expect(failure.message).toBe(
      "You've hit your org's monthly spend limit · run /usage-credits to ask your admin for a higher limit · your weekly limit resets 7am (Asia/Seoul)",
    );
  });

  it("calls a usage limit a limit too", () => {
    expect(probeFailure(new Error("Claude AI usage limit reached|1764000000"), false).code).toBe(CLAUDE_LIMIT_CODE);
  });

  it("says the check timed out when it was stopped, whatever the SDK threw", () => {
    const failure = probeFailure(new Error("Claude Code process aborted by user"), true);
    expect(failure).toMatchObject({ status: 504, code: PROBE_TIMEOUT_CODE });
  });

  it("answers an overloaded API as a passing failure, not a used-up limit", () => {
    const failure = probeFailure(new Error('Claude Code returned an error result: API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), false);
    expect(failure).toMatchObject({ status: 502, code: undefined });
  });

  it("answers anything else with a 502 and the reason", () => {
    const failure = probeFailure(new Error("Claude Code returned an error result: spawn claude ENOENT"), false);
    expect(failure).toMatchObject({ status: 502, code: undefined, message: "spawn claude ENOENT" });
  });
});

describe("claudeWindows", () => {
  it("keeps every window, shortest first, with what names it", () => {
    const info = {
      unifiedWindows: {
        seven_day_opus: { utilization: 0.5 },
        seven_day: { utilization: 0.83, resetsAt: 1_795_212_000 },
        five_hour: { utilization: 0.04, resetsAt: 1_794_928_200 },
        seven_day_new_thing: { utilization: 0.1 },
        broken: { nope: true },
      },
    };
    expect(claudeWindows(info)).toEqual([
      { id: "five_hour", minutes: 300, usedPercent: 4, resetsAt: 1_794_928_200_000 },
      { id: "seven_day", minutes: 10_080, usedPercent: 83, resetsAt: 1_795_212_000_000 },
      { id: "seven_day_opus", minutes: 10_080, model: "Opus", usedPercent: 50, resetsAt: undefined },
      { id: "seven_day_new_thing", minutes: undefined, usedPercent: 10, resetsAt: undefined },
    ]);
  });

  it("ignores other shapes", () => {
    expect(claudeWindows({ status: "allowed" })).toEqual([]);
    expect(claudeWindows(null)).toEqual([]);
  });
});

describe("claudeUsageWindows", () => {
  it("reads /usage windows as percentages with epoch reset times, shortest first", () => {
    const windows = claudeUsageWindows({
      seven_day: { utilization: 50, resets_at: "2026-11-27T22:00:00.011598+00:00" },
      five_hour: { utilization: 25.4, resets_at: "2026-11-25T05:50:00+00:00" },
      seven_day_opus: null,
      extra_usage: { is_enabled: false },
    });
    expect(windows).toEqual([
      { id: "five_hour", minutes: 300, usedPercent: 25, resetsAt: Date.parse("2026-11-25T05:50:00Z") },
      { id: "seven_day", minutes: 10_080, usedPercent: 50, resetsAt: Date.parse("2026-11-27T22:00:00.011Z") },
    ]);
  });

  it("adds per-model weekly windows after the known ones", () => {
    const windows = claudeUsageWindows({
      five_hour: { utilization: 1, resets_at: null },
      model_scoped: [
        { display_name: "Fable", utilization: 0, resets_at: "2026-11-27T22:00:00+00:00" },
        { display_name: "Unknown", utilization: null, resets_at: null },
      ],
    });
    expect(windows.map((w) => [w.id, w.model, w.usedPercent])).toEqual([
      ["five_hour", undefined, 1],
      ["model_fable", "Fable", 0],
    ]);
    expect(windows[0].resetsAt).toBeUndefined();
  });

  it("gives nothing for other shapes", () => {
    expect(claudeUsageWindows(null)).toEqual([]);
    expect(claudeUsageWindows({ five_hour: { utilization: "a lot" }, model_scoped: "none" })).toEqual([]);
  });
});

const w = (id: string, minutes: number, usedPercent: number, model?: string): LimitWindow => ({ id, minutes, ...(model === undefined ? {} : { model }), usedPercent, resetsAt: undefined });

describe("mergeClaudeWindows", () => {
  it("updates the windows an event names and keeps the per-model ones it lacks", () => {
    const known = [w("five_hour", 300, 10), w("seven_day", 10_080, 20), w("model_fable", 10_080, 30, "Fable"), w("model_opus", 10_080, 40, "opus")];
    const fresh = [w("five_hour", 300, 15), w("seven_day_opus", 10_080, 45, "Opus")];
    expect(mergeClaudeWindows(known, fresh)).toEqual([w("five_hour", 300, 15), w("seven_day", 10_080, 20), w("model_fable", 10_080, 30, "Fable"), w("seven_day_opus", 10_080, 45, "Opus")]);
  });
});
