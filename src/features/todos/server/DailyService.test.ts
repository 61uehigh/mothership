import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@/features/todos/model/Daily";
import { DailyService, type DayClock } from "@/features/todos/server/DailyService";

function meeting(id: string, at: string): ActivityItem {
  return { id, kind: "meeting", title: id, detail: undefined, at: Date.parse(at), url: undefined };
}

/** Days in UTC+9 (Asia/Seoul, no daylight saving), whatever zone the test machine is in. */
const seoul: DayClock = {
  today: async () => "2026-11-25",
  bounds: async (day) => {
    const from = Date.parse(`${day}T00:00:00+09:00`);
    return { from, to: from + 24 * 60 * 60_000 };
  },
};

describe("DailyService", () => {
  it("cuts the day at the clock's midnights and hands loaders that range", async () => {
    const ranges: Array<{ day: string; from: number; to: number }> = [];
    const daily = new DailyService(
      {
        calendar: async (range) => {
          ranges.push(range);
          return [
            meeting("late-the-day-before", "2026-11-24T23:30:00+09:00"),
            meeting("just-after-midnight", "2026-11-25T00:15:00+09:00"),
            meeting("late-evening", "2026-11-25T23:45:00+09:00"),
            meeting("next-day", "2026-11-26T00:00:00+09:00"),
          ];
        },
      },
      seoul,
    );
    const activity = await daily.activity("2026-11-25", false);
    expect(ranges).toEqual([{ day: "2026-11-25", from: Date.parse("2026-11-25T00:00:00+09:00"), to: Date.parse("2026-11-26T00:00:00+09:00") }]);
    expect(activity.items.map((item) => item.id)).toEqual(["just-after-midnight", "late-evening"]);
  });

  it("reuses a cached day until refresh is asked", async () => {
    let calls = 0;
    const daily = new DailyService(
      {
        calendar: async () => {
          calls += 1;
          return [];
        },
      },
      seoul,
    );
    await daily.activity("2026-11-25", false);
    await daily.activity("2026-11-25", false);
    expect(calls).toBe(1);
    await daily.activity("2026-11-25", true);
    expect(calls).toBe(2);
  });
});
