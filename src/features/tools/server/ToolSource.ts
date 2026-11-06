import type { DashboardItem, ToolKind } from "@/features/tools/model/Dashboard";
import type { DashboardConfig, WidgetConfig } from "@/features/tools/server/DashboardConfig";
import type { ToolCaller } from "@/platform/mcp/ToolCaller";

/**
 * ### ToolWidget
 *
 * A sidebar widget backed by a work tool (not the agents or questions lists).
 */
export type ToolWidget = Exclude<WidgetConfig, { type: "agents" | "questions" }>;

/**
 * ### isToolWidget
 *
 * @returns Whether `widget` reads from a work tool.
 */
export function isToolWidget(widget: WidgetConfig): widget is ToolWidget {
  return widget.type !== "agents" && widget.type !== "questions";
}

/**
 * ### SourceContext
 *
 * What a source may need besides its widget.
 */
export type SourceContext = {
  /** The time the load started, in epoch milliseconds. */
  now: number;
  /** The dashboard's time zone, for "today". */
  timeZone: string;
};

/**
 * ### ToolSource
 *
 * How one work tool fills its widget and answers search. Each tool provides
 * one; the dashboard runs whichever sources are registered, so adding a
 * tool never changes the dashboard itself.
 */
export type ToolSource<W extends ToolWidget> = {
  /** Shown under the widget's list, e.g. a limit of what the tool can tell. */
  note?: string;
  /** The widget's items. */
  load: (caller: ToolCaller, widget: W, context: SourceContext) => Promise<Array<DashboardItem>>;
  /** Items matching `query`, for the search across tools. */
  search: (caller: ToolCaller, widget: W, query: string, context: SourceContext) => Promise<Array<DashboardItem>>;
};

/**
 * ### ToolSources
 *
 * One source per tool kind, each typed by its own widget.
 */
export type ToolSources = { [K in ToolKind]: ToolSource<Extract<ToolWidget, { type: K }>> };

/**
 * ### findWidget
 *
 * @returns The first widget of `kind` in the config, or `undefined` when there is none.
 */
export function findWidget<K extends ToolKind>(config: DashboardConfig, kind: K): Extract<ToolWidget, { type: K }> | undefined {
  // Narrowed by `type`, which is exactly what the extracted member is keyed by.
  return config.widgets.find((w) => w.type === kind) as Extract<ToolWidget, { type: K }> | undefined;
}
