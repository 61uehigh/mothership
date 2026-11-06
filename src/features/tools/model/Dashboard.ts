/**
 * ### TOOL_KINDS
 *
 * Work tools the dashboard reads, each through its MCP server or a claude.ai
 * connector. Some reads and writes also call a tool's own API (Linear reactions,
 * Slack messages sent as you).
 */
export const TOOL_KINDS = ["calendar", "linear", "slack", "nuclino", "notion"] as const;

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
  /** When it is due, `YYYY-MM-DD` (Linear issues), for sorting it into the Inbox. */
  due: string | undefined;
  /** Linear's priority: 1 urgent, 2 high, 3 medium, 4 low, 0 none. */
  priority: number | undefined;
  /**
   * Why a Slack message is listed, for sorting it into the Inbox: a DM to
   * you, a mention of you, or an `@here` / `@channel` in a channel you are
   * in; with where it was posted (`#channel`, or `DM`).
   */
  slack: { reason: SlackReason; channel: string } | undefined;
  /** A calendar event's timing and your reply, for the sidebar's day list and the Inbox. */
  event: CalendarItemFacts | undefined;
};

/**
 * ### CalendarItemFacts
 *
 * What the calendar widget knows about one of its events beyond the row.
 */
export type CalendarItemFacts = {
  /** The event's local date, `YYYY-MM-DD` in the dashboard's time zone. */
  day: string;
  /** It falls on the day the list was loaded (the sidebar shows only these). */
  today: boolean;
  /** Epoch milliseconds it ends; `undefined` when unknown. */
  end: number | undefined;
  allDay: boolean;
  /** Google's event type in lower case without underscores: `default`, `outofoffice`, `focustime`, `workinglocation`, … */
  eventType: string;
  /** The recurring series it belongs to, if any. */
  series: string | undefined;
  /** Your reply when you are a guest: `accepted`, `tentative`, or `needsAction` (declined events are left out). */
  myResponse: string | undefined;
};

/**
 * ### SlackReason
 *
 * Why a Slack message is listed: `dm` sent to you, `mention` of you, or
 * `group` for `@here` / `@channel`.
 */
export type SlackReason = "dm" | "mention" | "group";

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
