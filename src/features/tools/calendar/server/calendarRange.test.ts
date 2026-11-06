import { describe, expect, it } from "vitest";
import { calendarRange } from "@/features/tools/calendar/server/calendarRange";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import type { ToolOutcome } from "@/features/tools/server/DashboardService";
import { DETAIL_PREFIXES, DetailCache } from "@/features/tools/server/DetailCache";

const config: DashboardConfig = {
  timezone: "Asia/Seoul",
  automaticTimezone: "Asia/Seoul",
  refreshSeconds: 120,
  me: { names: [] },
  widgets: [{ id: "calendar", title: "Calendar", type: "calendar", via: "mcp", server: "google_calendar", connector: "Google Calendar", refreshSeconds: undefined, disabled: false, calendars: ["primary"] }],
};

function tools() {
  let calls = 0;
  const dashboard = {
    config: async () => config,
    // Counts calls without reaching a calendar server.
    callTool: async <T>(): Promise<ToolOutcome<T>> => ({ status: "ok", value: { timeZone: "Asia/Seoul", events: [], call: ++calls } as T }),
  };
  return { tools: { dashboard, details: new DetailCache() }, calls: () => calls };
}

describe("calendarRange", () => {
  it("shares one cache entry per range, which a calendar write forgets", async () => {
    const { tools: deps, calls } = tools();
    await calendarRange(deps, "2026-11-23", 7, false);
    await calendarRange(deps, "2026-11-23", 7, false);
    expect(calls()).toBe(1);
    await calendarRange(deps, "2026-11-23", 1, false);
    await calendarRange(deps, "2026-11-24", 7, false);
    expect(calls()).toBe(3);
    deps.details.forget(DETAIL_PREFIXES.calendar);
    await calendarRange(deps, "2026-11-23", 7, false);
    expect(calls()).toBe(4);
  });
});
