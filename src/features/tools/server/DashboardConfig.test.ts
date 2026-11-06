import { describe, expect, it } from "vitest";
import { applyOverrides, type DashboardConfig, effectiveTimeZone, type WidgetConfig, withAddedTools } from "@/features/tools/server/DashboardConfig";

const source = { via: "mcp", refreshSeconds: undefined, disabled: false } as const;

const calendar: WidgetConfig = { ...source, id: "calendar", title: "Calendar", type: "calendar", server: "google_calendar", connector: "Google Calendar", calendars: ["primary"] };
const slack: WidgetConfig = {
  ...source,
  id: "slack",
  title: "Slack",
  type: "slack",
  server: "slack",
  connector: "Slack",
  lookbackHours: 48,
  limit: 15,
  userId: "U-FILE",
  groupMentions: true,
};
const notion: WidgetConfig = { ...source, id: "notion", title: "Notion", type: "notion", server: "notion", connector: "Notion", limit: 10 };
const agents: WidgetConfig = { id: "agents", title: "Agents", type: "agents" };

function config(widgets: Array<WidgetConfig>): DashboardConfig {
  return { timezone: "Asia/Seoul", automaticTimezone: "Asia/Seoul", refreshSeconds: 120, me: { names: ["File Name"] }, widgets };
}

describe("withAddedTools", () => {
  it("adds a tool's widget, with defaults, after the file's own when the file predates the tool", () => {
    const widgets = withAddedTools(config([calendar, agents])).widgets;
    expect(widgets.map((w) => w.id)).toEqual(["calendar", "agents", "notion"]);
    expect(widgets[2]).toMatchObject({ type: "notion", server: "notion", via: "mcp", disabled: false, limit: 10 });
  });

  it("leaves a file alone that already has a widget of that type, whatever its id", () => {
    const own: WidgetConfig = { ...notion, id: "my-notion" };
    expect(withAddedTools(config([own])).widgets).toEqual([own]);
  });

  it("does not add a widget whose id another widget already uses, so ids stay unique", () => {
    const taken: WidgetConfig = { ...agents, id: "notion" };
    expect(withAddedTools(config([taken])).widgets).toEqual([taken]);
  });
});

describe("applyOverrides", () => {
  it("keeps a tool turned off in Settings on the dashboard as turned off, with its connection kept", () => {
    const [widget] = applyOverrides(config([calendar]), { connections: { google_calendar: "off" }, profile: {} }).widgets;
    expect(widget).toMatchObject({ disabled: true, via: "mcp" });
  });

  it("turns back on a widget the file turned off once Settings picks how it connects", () => {
    const off: WidgetConfig = { ...calendar, disabled: true };
    const [widget] = applyOverrides(config([off]), { connections: { google_calendar: "claude" }, profile: {} }).widgets;
    expect(widget).toMatchObject({ disabled: false, via: "claude-connector" });
  });

  it("matches a connection to the widget's MCP server name, not its type", () => {
    const work: WidgetConfig = { ...calendar, server: "work_calendar" };
    const { widgets } = applyOverrides(config([calendar, work]), { connections: { work_calendar: "off" }, profile: {} });
    expect(widgets.map((w) => "disabled" in w && w.disabled)).toEqual([false, true]);
  });

  it("leaves widgets without a tool and tools Settings has no choice for as the file has them", () => {
    const file = config([calendar, agents]);
    expect(applyOverrides(file, { connections: { slack: "off" }, profile: {} }).widgets).toEqual(file.widgets);
  });

  it("replaces the Slack user id and group mentions only when Settings sets them", () => {
    const [kept] = applyOverrides(config([slack]), { connections: {}, profile: {} }).widgets;
    expect(kept).toMatchObject({ userId: "U-FILE", groupMentions: true });
    const [replaced] = applyOverrides(config([slack]), { connections: {}, profile: { slackUserId: "U-SET" }, slackGroupMentions: false }).widgets;
    expect(replaced).toMatchObject({ userId: "U-SET", groupMentions: false });
  });

  it("replaces your names only when Settings sets them, even with no names at all", () => {
    const kept = applyOverrides(config([]), { connections: {}, profile: {} });
    expect(kept).toMatchObject({ me: { names: ["File Name"] } });
    const replaced = applyOverrides(config([]), { connections: {}, profile: { names: [] } });
    expect(replaced).toMatchObject({ me: { names: [] } });
  });
});

describe("effectiveTimeZone", () => {
  it("uses the zone chosen in Settings over the file's and this computer's", () => {
    expect(effectiveTimeZone({ chosen: "Europe/Berlin", file: "Asia/Seoul", computer: "America/New_York" })).toBe("Europe/Berlin");
  });

  it("uses the file's zone when none is chosen, over this computer's", () => {
    expect(effectiveTimeZone({ chosen: undefined, file: "Asia/Seoul", computer: "America/New_York" })).toBe("Asia/Seoul");
  });

  it("follows this computer when neither Settings nor the file sets a zone, treating blank as unset", () => {
    expect(effectiveTimeZone({ chosen: "", file: " ", computer: "America/New_York" })).toBe("America/New_York");
  });

  it("falls back to UTC when this computer reports no zone", () => {
    expect(effectiveTimeZone({ chosen: undefined, file: undefined, computer: "" })).toBe("UTC");
  });
});
