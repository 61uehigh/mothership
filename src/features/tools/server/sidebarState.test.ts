import { describe, expect, it } from "vitest";
import type { DashboardConfig, WidgetConfig } from "@/features/tools/server/DashboardConfig";
import { sidebarState } from "@/features/tools/server/sidebarState";

const source = { refreshSeconds: undefined } as const;
const slack = (id: string, via: "mcp" | "claude-connector", disabled: boolean): WidgetConfig => ({
  ...source,
  id,
  title: "Slack",
  type: "slack",
  via,
  disabled,
  server: "slack",
  connector: "Slack",
  lookbackHours: 48,
  limit: 15,
  userId: `U-${id}`,
  groupMentions: false,
});
const notionOn = (server: string): WidgetConfig => ({ ...source, id: "notion", title: "Notion", type: "notion", via: "mcp", disabled: true, server, connector: "Notion", limit: 10 });
const agents: WidgetConfig = { id: "agents", title: "Agents", type: "agents" };

function config(widgets: Array<WidgetConfig>): DashboardConfig {
  return { timezone: "America/New_York", automaticTimezone: "America/New_York", refreshSeconds: 120, me: { names: ["Kim"] }, widgets };
}

describe("sidebarState", () => {
  it("keeps each connection's first widget and leaves out widgets without a Settings connection", () => {
    const state = sidebarState(config([agents, slack("first", "claude-connector", false), slack("second", "mcp", true), notionOn("my_notion")]));
    expect(state.widgets).toEqual({ slack: { via: "claude-connector", disabled: false } });
  });

  it("reads the profile from the config, with the Slack id from the first slack widget", () => {
    const state = sidebarState(config([slack("first", "mcp", false), notionOn("notion")]));
    expect(state.widgets.notion).toEqual({ via: "mcp", disabled: true });
    expect(state.profile).toEqual({ names: ["Kim"], slackUserId: "U-first" });
  });
});
