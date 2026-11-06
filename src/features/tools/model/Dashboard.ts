import type { ToolErrorCode } from "@/lib/apiErrorCodes";

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
 * ### ItemBadge
 *
 * Why a row stands out, as a fact the browser words and colours: a Linear
 * issue that is `overdue` or marked `urgent` / `high`, or a Slack message
 * that is a `dm`, a `mention` of you, or a `group` mention (`@here`).
 */
export type ItemBadge = "overdue" | "urgent" | "high" | "dm" | "mention" | "group";

/**
 * ### ItemMeta
 *
 * The short text at a row's right: an identifier or a time range as text,
 * or an all-day event, which the browser words in its language (`day`,
 * `YYYY-MM-DD`, is set in search results, where rows span many days).
 */
export type ItemMeta = string | { allDay: true; day: string | undefined };

/**
 * ### DashboardItem
 *
 * One row in a widget or a search result, already normalised from the
 * tool's own response format.
 */
export type DashboardItem = {
  /** Unique within its widget. */
  id: string;
  /** Empty when the tool gave none (an untitled event, a message without text); the browser says so in its language. */
  title: string;
  /** Second line: channel, team, location, and so on. */
  subtitle: string | undefined;
  meta: ItemMeta | undefined;
  /** Epoch milliseconds the item is about, used for relative times. */
  at: number | undefined;
  /** Opens the item in its own tool. */
  url: string | undefined;
  /** A calendar event's video call. */
  meetingUrl: string | undefined;
  badge: ItemBadge | undefined;
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
   * in; with where it was posted (`#channel`, or `DM`), and `conversation`,
   * the channel or DM (and thread, if any) it is in: its channel id, plus
   * `:<thread ts>` in a thread, so the Inbox can show one row per conversation;
   * `ts` is the message's own Slack timestamp.
   */
  slack: { reason: SlackReason; channel: string; conversation: string | undefined; ts: string | undefined } | undefined;
  /** A calendar event's timing and your reply, for the sidebar's day list and the Inbox. */
  event: CalendarItemFacts | undefined;
};

/**
 * ### CalendarItemFacts
 *
 * What the calendar widget knows about one of its events beyond the row.
 */
export type CalendarItemFacts = {
  /** Where it stands on the day the list was loaded: ended, in progress, the next one today, or any other. */
  state: CalendarEventState;
  /** The event's local start date, `YYYY-MM-DD` in the dashboard's time zone. */
  day: string;
  /** It overlaps the day the list was loaded, even if it started earlier (the sidebar shows only these). */
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
 * ### CalendarEventState
 *
 * See {@link CalendarItemFacts.state}.
 */
export type CalendarEventState = "past" | "now" | "next" | "later";

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
 * - `ok`: items loaded; `notes` name known limitations, if any.
 * - `unavailable`: the tool is not set up; `reason` says what to configure.
 * - `error`: the tool is set up but the call failed; `message` is the error as thrown, often the tool's own words.
 *   `code` is set when mothership knows what happened (see {@link ToolErrorCode}), and `retryAt`
 *   (epoch milliseconds) when a rate limit lets calls through again.
 */
export type WidgetResult =
  | { status: "ok"; items: Array<DashboardItem>; notes: Array<WidgetNote>; fetchedAt: number }
  | { status: "unavailable"; reason: UnavailableReason; fetchedAt: number }
  | ({ status: "error"; fetchedAt: number } & ToolErrorFacts);

/**
 * ### ToolErrorFacts
 *
 * A failed tool call as facts: the raw `message`, and the `code`,
 * `retryAt`, and `connector` (the claude.ai connector that is not connected)
 * mothership adds when it recognized the failure itself.
 */
export type ToolErrorFacts = { message: string; code?: ToolErrorCode; retryAt?: number; connector?: string };

const TOOL_ERROR_CODES: ReadonlyArray<ToolErrorCode> = ["rate-limited", "timed-out", "connector-not-connected", "claude-login", "claude-limit"];
const isToolErrorCode = (code: string): code is ToolErrorCode => (TOOL_ERROR_CODES as ReadonlyArray<string>).includes(code);

/**
 * ### toolErrorCodeOf
 *
 * @returns `code` when it is a {@link ToolErrorCode} (e.g. a route's 429 `rate-limited`), else `undefined`.
 */
export function toolErrorCodeOf(code: string | undefined): ToolErrorCode | undefined {
  return code !== undefined && isToolErrorCode(code) ? code : undefined;
}

/**
 * ### WidgetNote
 *
 * A known limit of what a widget shows, worded by the browser:
 * `connector-usage` (read through a claude.ai connector, which costs a little
 * Claude usage per refresh), `slack-recent` (Slack search can't tell read
 * from unread), `nuclino-recent` (the newest of up to 100 docs per
 * workspace), `notion-shared` (with a token, only pages shared with the integration).
 */
export type WidgetNote = "connector-usage" | "slack-recent" | "nuclino-recent" | "notion-shared";

/**
 * ### UnavailableReason
 *
 * Why a tool can't be reached, as facts the browser words:
 * - `turned-off`: its widget (of `kind`, titled `widget` in `config/dashboard.yaml`) is off in Settings.
 * - `not-connected`: its MCP server needs a key you connect in Settings.
 * - `no-server`: `mcp.yaml` has no server named `server`.
 * - `mcp-config-unreadable`: `mcp.yaml` could not be read (`error`, as thrown).
 * - `no-widget`: `config/dashboard.yaml` has no widget of `kind`.
 */
export type UnavailableReason =
  | { code: "turned-off"; kind: ToolKind; widget: string }
  | { code: "not-connected" }
  | { code: "no-server"; server: string }
  | { code: "mcp-config-unreadable"; error: string }
  | { code: "no-widget"; kind: ToolKind };

/**
 * ### describeUnavailable
 *
 * {@link UnavailableReason} in English: the `error` text a route sends
 * beside the reason's `code`, for callers that don't word the code.
 */
export function describeUnavailable(reason: UnavailableReason): string {
  switch (reason.code) {
    case "turned-off":
      return `${reason.widget} is turned off in Settings.`;
    case "not-connected":
      return "Connect it in Settings to see it here.";
    case "no-server":
      return `No "${reason.server}" server in mcp.yaml`;
    case "mcp-config-unreadable":
      return `Could not read the MCP config: ${reason.error}`;
    case "no-widget":
      return `No ${reason.kind} widget in config/dashboard.yaml`;
  }
}

/**
 * ### unavailableParams
 *
 * The facts of an {@link UnavailableReason} besides its `code`, which a route
 * sends as `params` beside the code; {@link unavailableReasonOf} reads them back.
 */
export function unavailableParams(reason: UnavailableReason): Record<string, string> {
  return Object.fromEntries(Object.entries(reason).filter(([key]) => key !== "code"));
}

const isToolKind = (value: string): value is ToolKind => (TOOL_KINDS as ReadonlyArray<string>).includes(value);

/**
 * ### unavailableReasonOf
 *
 * Rebuilds an {@link UnavailableReason} from a failed route's `code` and `params`.
 *
 * @returns `undefined` when `code` is not a reason's, or a fact it needs is missing.
 */
export function unavailableReasonOf(code: string | undefined, params: Readonly<Record<string, unknown>> | undefined): UnavailableReason | undefined {
  const text = (key: string): string | undefined => {
    const value = params?.[key];
    return typeof value === "string" ? value : undefined;
  };
  switch (code) {
    case "turned-off": {
      const kind = text("kind");
      const widget = text("widget");
      return kind === undefined || !isToolKind(kind) || widget === undefined ? undefined : { code, kind, widget };
    }
    case "not-connected":
      return { code };
    case "no-server": {
      const server = text("server");
      return server === undefined ? undefined : { code, server };
    }
    case "mcp-config-unreadable": {
      const error = text("error");
      return error === undefined ? undefined : { code, error };
    }
    case "no-widget": {
      const kind = text("kind");
      return kind === undefined || !isToolKind(kind) ? undefined : { code, kind };
    }
    default:
      return undefined;
  }
}

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
