import { describe, expect, it } from "vitest";
import { claudeWindows } from "@/features/usage/server/UsageTracker";
import { windowLabel } from "@/features/usage/model/Usage";

describe("claudeWindows", () => {
  it("keeps every window, shortest first, named for people", () => {
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
      { id: "five_hour", label: "5-hour", usedPercent: 4, resetsAt: 1_794_928_200_000 },
      { id: "seven_day", label: "Weekly", usedPercent: 83, resetsAt: 1_795_212_000_000 },
      { id: "seven_day_opus", label: "Weekly (Opus)", usedPercent: 50, resetsAt: undefined },
      { id: "seven_day_new_thing", label: "Seven day new thing", usedPercent: 10, resetsAt: undefined },
    ]);
  });

  it("ignores other shapes", () => {
    expect(claudeWindows({ status: "allowed" })).toEqual([]);
    expect(claudeWindows(null)).toEqual([]);
  });
});

describe("windowLabel", () => {
  it("names Codex's windows by length", () => {
    expect(windowLabel(300)).toBe("5-hour");
    expect(windowLabel(10_080)).toBe("Weekly");
    expect(windowLabel(1_440)).toBe("Daily");
    expect(windowLabel(43_200)).toBe("30-day");
    expect(windowLabel(45)).toBe("45-minute");
  });
});
