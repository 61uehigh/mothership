/**
 * ### NuclinoDoc
 *
 * One Nuclino document as returned by `GET /api/tools/nuclino/item`.
 */
export type NuclinoDoc = {
  /** Nuclino item UUID. */
  id: string;
  title: string;
  /** Body as GitHub-flavoured Markdown (Nuclino grid tables are converted to pipe tables). */
  markdown: string;
  /** Opens the doc in Nuclino. */
  url: string;
  /** Epoch milliseconds of the last edit, when Nuclino reports it. */
  updatedAt: number | undefined;
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
 * ### ToolApiError
 *
 * Body of a non-2xx response from `/api/tools/*`.
 */
export type ToolApiError = { error: string };

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
  /** Opens the message in Slack. */
  url: string;
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
  /** Epoch milliseconds; for all-day events, midnight UTC of the date. */
  start: number | undefined;
  end: number | undefined;
  allDay: boolean;
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
