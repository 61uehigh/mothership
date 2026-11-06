import { describe, expect, it } from "vitest";
import type { DashboardItem } from "@/features/tools/model/Dashboard";
import type { DashboardConfig } from "@/features/tools/server/DashboardConfig";
import { DashboardService, type DashboardDeps, type WidgetResults } from "@/features/tools/server/DashboardService";
import type { ToolSources } from "@/features/tools/server/ToolSource";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

const config = {
  timezone: "UTC",
  automaticTimezone: "UTC",
  refreshSeconds: 120,
  me: { names: [] },
  widgets: [
    { id: "slack", title: "Slack", type: "slack", via: "claude-connector", server: "slack", connector: "Slack", disabled: false, lookbackHours: 48, limit: 15, groupMentions: false },
  ],
} as DashboardConfig;

function deps(results: WidgetResults, load: () => Promise<Array<DashboardItem>>): DashboardDeps {
  const slack = { load, search: async () => [] };
  return {
    sources: { slack } as unknown as ToolSources,
    loadConfig: async () => config,
    mcpConfig: async () => ({ servers: [], claudeConnectors: new Map(), unavailable: [] }),
    mcpCaller: () => ({}) as ToolCaller,
    connectorCaller: () => ({}) as ToolCaller,
    results,
  };
}

describe("DashboardService", () => {
  it("does not cache a running load that another instance invalidated", async () => {
    const results: WidgetResults = { cache: new Map(), inflight: new Map() };
    let loads = 0;
    let release: () => void = () => {};
    const load = async (): Promise<Array<DashboardItem>> => {
      loads += 1;
      if (loads === 1) await new Promise<void>((resolve) => (release = resolve));
      return [];
    };
    const sidebar = new DashboardService(deps(results, load));
    const writer = new DashboardService(deps(results, load));

    const first = sidebar.load("slack", false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await writer.invalidate("slack");
    release();
    await first;

    expect(results.cache.has("slack")).toBe(false);
    await sidebar.load("slack", false);
    expect(loads).toBe(2);
  });
});
