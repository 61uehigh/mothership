/**
 * ### TOOL_KINDS
 *
 * Work tools the dashboard reads directly over MCP.
 */
export const TOOL_KINDS = ["calendar", "linear", "slack", "nuclino"] as const;

/**
 * ### ToolKind
 *
 * One of {@link TOOL_KINDS}.
 */
export type ToolKind = (typeof TOOL_KINDS)[number];

/**
 * ### WidgetKind
 *
 * A tool widget, or `agents` / `questions`, which the browser builds from
 * live agent state.
 */
export type WidgetKind = ToolKind | "agents" | "questions";

/**
 * ### ItemTone
 *
 * Badge colour intent.
 */
export type ItemTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * ### DashboardItem
 *
 * One row in a widget or a search result, already normalised from the
 * tool's own response format.
 */
export type DashboardItem = {
  /** Unique within its widget. */
  id: string;
  title: string;
  /** Second line: channel, team, location, and so on. */
  subtitle: string | undefined;
  /** Right-aligned short text such as a time range or identifier. */
  meta: string | undefined;
  /** Epoch milliseconds the item is about, used for relative times. */
  at: number | undefined;
  /** Opens the item in its own tool. */
  url: string | undefined;
  /** An extra link such as a meeting join URL. */
  secondaryLink: { label: string; url: string } | undefined;
  badge: { label: string; tone: ItemTone } | undefined;
  /** Draws attention: the current meeting, an urgent issue. */
  highlighted: boolean;
  /** De-emphasised: a meeting that already ended. */
  muted: boolean;
  /** First message for an agent when the user hands this item off. */
  delegatePrompt: string;
};

/**
 * ### WidgetInfo
 *
 * A widget's identity and placement from `config/dashboard.yaml`.
 */
export type WidgetInfo = { id: string; kind: WidgetKind; title: string };

/**
 * ### WidgetResult
 *
 * The outcome of loading one tool widget.
 * - `ok`: items loaded; `note` explains a known limitation, if any.
 * - `unavailable`: the tool is not set up; `reason` says what to configure.
 * - `error`: the tool is set up but the call failed.
 */
export type WidgetResult =
  | { status: "ok"; items: Array<DashboardItem>; note: string | undefined; fetchedAt: number }
  | { status: "unavailable"; reason: string; fetchedAt: number }
  | { status: "error"; message: string; fetchedAt: number };

/**
 * ### SearchGroup
 *
 * Results from one tool for a unified search query.
 */
export type SearchGroup = {
  kind: ToolKind;
  title: string;
  result: WidgetResult;
};
