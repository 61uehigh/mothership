/**
 * ### SLACK_MESSAGE_MAX
 *
 * The longest Slack message mothership sends, in characters; the send
 * route's schema and the reply box both use it.
 */
export const SLACK_MESSAGE_MAX = 5000;

/**
 * ### LINEAR_COMMENT_MAX
 *
 * The longest Linear comment or reply mothership posts, in characters; the
 * comment route's schema and the comment box both use it.
 */
export const LINEAR_COMMENT_MAX = 20_000;

/**
 * ### NuclinoDoc
 *
 * One Nuclino document as returned by `GET /api/tools/nuclino/item`.
 */
export type NuclinoDoc = {
  /** Nuclino item UUID. */
  id: string;
  /** Empty when the doc has none; the UI says so in its language. */
  title: string;
  /** Body as GitHub-flavoured Markdown (Nuclino grid tables are converted to pipe tables). */
  markdown: string;
  /** Opens the doc in Nuclino. */
  url: string;
  /** Epoch milliseconds of the last edit, when Nuclino reports it. */
  updatedAt: number | undefined;
};

/**
 * ### NotionPage
 *
 * One Notion page as returned by `GET /api/tools/notion/page`.
 */
export type NotionPage = {
  /** Notion page id. */
  id: string;
  /** Empty when the page has none; the UI says so in its language. */
  title: string;
  /** Body as GitHub-flavoured Markdown (Notion's callouts, toggles, and tables rewritten). */
  markdown: string;
  /** Opens the page in Notion. */
  url: string;
  /** Epoch milliseconds of the last edit, when Notion reports it. */
  updatedAt: number | undefined;
  /** Notion left part of a long page out. */
  truncated: boolean;
};

/**
 * ### Reaction
 *
 * Emoji reactions of one kind on a message, comment, or issue.
 */
export type Reaction = {
  /** Shortcode name, e.g. `+1` or `eyes` (Slack and Linear both store names). */
  emoji: string;
  count: number;
  /** Names of who reacted, when the tool reports them. */
  users: Array<string>;
  /** Your own reaction's id when you reacted and it can be removed (Linear only). */
  mine: string | undefined;
};

/**
 * ### LinearComment
 *
 * One comment on a {@link LinearIssue}, oldest first.
 */
export type LinearComment = {
  /** Comment UUID; `undefined` when comments came from MCP without ids. */
  id: string | undefined;
  /** The thread's first comment when this is a reply. */
  parentId: string | undefined;
  reactions: Array<Reaction>;
  /** Display name of the author, or `undefined` for integrations without a user. */
  author: string | undefined;
  /** Markdown body. */
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
};

/**
 * ### LinearIssue
 *
 * One Linear issue with its comments, as returned by `GET /api/tools/linear/issue`.
 */
export type LinearIssue = {
  /** Identifier such as `DEV-123`. */
  id: string;
  title: string;
  /** Description as Markdown; empty when the issue has none. */
  markdown: string;
  /** Opens the issue in Linear. */
  url: string | undefined;
  /** Workflow state name, e.g. "In Progress". */
  status: string | undefined;
  /** Linear priority; `value` 1 is urgent and 4 is low, 0 means none. */
  priority: { value: number; name: string } | undefined;
  /** Assignee display name. */
  assignee: string | undefined;
  /** Team name. */
  team: string | undefined;
  /** Project name. */
  project: string | undefined;
  /** Label names. */
  labels: Array<string>;
  /** Epoch milliseconds of the last update. */
  updatedAt: number | undefined;
  comments: Array<LinearComment>;
  /** Reactions on the issue itself. */
  reactions: Array<Reaction>;
  /** Whether reactions can be added and replies threaded (needs `LINEAR_API_KEY`). */
  canReact: boolean;
};

/**
 * ### LinearNotification
 *
 * One entry of your Linear inbox (Linear's own notifications), as the
 * Linear MCP server's `get_notifications` lists it.
 */
export type LinearNotification = {
  id: string;
  /** Linear's type, e.g. `issueCommentMention`, `issueAssignedToYou`, `issueStatusChanged`. */
  type: string;
  /** The issue's title, or the review's or project's; empty when Linear gave none. */
  title: string;
  /** What happened, e.g. "Marked as completed by Kim" or "Kim mentioned you: …". */
  subtitle: string;
  /** The issue identifier such as `DEV-2305`, when it is about an issue. */
  issueId: string | undefined;
  url: string;
  /** Epoch milliseconds it was created. */
  at: number;
  read: boolean;
};

/**
 * ### SlackThreadMessage
 *
 * One message of a {@link SlackThread}.
 */
export type SlackThreadMessage = {
  /** Slack message timestamp, e.g. `1792659089.594709`. */
  ts: string;
  /** Sender display name. */
  from: string;
  /** Epoch milliseconds, when the time could be parsed. */
  at: number | undefined;
  /** Body converted from Slack mrkdwn to Markdown. */
  markdown: string;
  /**
   * The small muted line Slack draws under an app's message (context blocks,
   * attachment footers), one plain-text entry per element.
   */
  context: Array<string>;
  reactions: Array<{ name: string; count: number }>;
  /** Attached file names, e.g. `IMG_4651.jpg (image/jpeg, 1.9 MB)`. */
  files: Array<string>;
};

/**
 * ### SlackThread
 *
 * A Slack message with its whole thread, as returned by `GET /api/tools/slack/thread`.
 */
export type SlackThread = {
  /** Channel or DM id, e.g. `C7553PRU0`. */
  channelId: string;
  /** The message that was opened; a reply when it sits inside a thread. */
  focusTs: string;
  /** Parent first, then replies oldest first. */
  messages: Array<SlackThreadMessage>;
  /** Whether Slack has more replies than were loaded. */
  truncated: boolean;
  /** The messages are a stretch of the channel or DM (a grouped Inbox row), not one thread. */
  conversation: boolean;
  /** Opens the message in Slack. */
  url: string;
  /**
   * In a DM, the other person's or app's name (`Linear`), from the messages
   * they sent; `undefined` in a channel or when only you wrote.
   */
  partner: string | undefined;
};

/**
 * ### CalendarAttendee
 *
 * One guest of a {@link CalendarEventDetail}.
 */
export type CalendarAttendee = {
  /** Display name, or the email when there is none. */
  name: string;
  email: string | undefined;
  /** Google response status: `accepted`, `declined`, `tentative`, or `needsAction`. */
  response: string;
  self: boolean;
  organizer: boolean;
  optional: boolean;
};

/**
 * ### CalendarEventDetail
 *
 * One Google Calendar event, as returned by `GET /api/tools/calendar/event`.
 */
export type CalendarEventDetail = {
  id: string;
  title: string;
  /** Epoch milliseconds; an all-day event's is midnight of its date in `timeZone`, as in the sidebar. */
  start: number | undefined;
  end: number | undefined;
  allDay: boolean;
  /** An all-day event's dates, `YYYY-MM-DD`, the end exclusive as Google gives it; `undefined` for a timed event. */
  dates: { start: string; end: string } | undefined;
  /** IANA zone the times should be shown in. */
  timeZone: string;
  location: string | undefined;
  /** Description converted from Google's HTML to Markdown; empty when there is none. */
  markdown: string;
  /** Opens the event in Google Calendar. */
  url: string | undefined;
  meetingUrl: string | undefined;
  /** e.g. "Google Meet". */
  meetingName: string | undefined;
  organizer: string | undefined;
  attendees: Array<CalendarAttendee>;
  /** Your own response, when you are a guest. */
  myResponse: string | undefined;
  recurring: boolean;
  status: string | undefined;
};
