// Every `code` a route sends with a failure, in one place. `HttpError.code` takes only these.

/**
 * ### API_ERROR_CODES
 *
 * The `code`s our routes send with failures you are expected to run into
 * (something gone, not set up, an input to fix) that any screen may meet.
 * The browser words them through the `apiError.*` keys of
 * `ui/i18n/catalog/server.ts`; the `error` text sent next to a code is only
 * the English fallback for callers that don't know the code.
 */
export const API_ERROR_CODES = [
  "session-not-found",
  "widget-not-found",
  "question-not-open",
  "message-not-queued",
  "working-folder-gone",
  "merge-while-working",
  "session-running",
  "session-busy",
  "no-worktree",
  "worktree-closed",
  "not-a-repository",
  "detached-head",
  "repo-on-other-branch",
  "repo-has-changes",
  "sub-agent-too-deep",
  "too-many-sub-agents",
  "message-to-self",
  "message-rate-limited",
  "git-access-unsupported",
  "calendar-not-set-up",
  "folder-not-absolute",
  "folder-missing",
  "timezone-unknown",
  "slack-member-id-invalid",
  "not-mothership-checkout",
  "linear-key-missing",
  "linear-key-refused",
  "slack-key-missing",
  "slack-key-refused",
  "slack-key-revoked",
  "slack-conversation-not-found",
  "slack-not-in-channel",
  "slack-scope-missing",
  "send-timed-out",
  "service-unreachable",
  "tool-item-not-found",
  "container-not-found",
  "oauth-client-not-json",
  "oauth-client-not-client-file",
  "oauth-client-service-account",
  "oauth-client-web-app",
  "oauth-client-not-desktop",
  "oauth-client-no-id",
  "oauth-client-no-secret",
  "oauth-client-too-large",
  "oauth-client-not-chosen",
  "calendar-server-missing",
  "calendar-sign-in-not-file",
  "env-value-unsupported-char",
  "note-empty",
  "todo-exists",
  "todo-not-found",
  "todos-file-invalid",
  "todos-file-unreadable",
  "desktop-unsupported",
  "vscode-missing",
  "docker-desktop-missing",
  "claude-timeout",
  "claude-bad-answer",
  "claude-failed",
] as const;

/**
 * ### ApiErrorCode
 *
 * One of {@link API_ERROR_CODES}.
 */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * ### RateLimitedCode
 *
 * Sent with status 429 while a tool is rate limiting, so a view waits and tries again.
 */
export type RateLimitedCode = "rate-limited";

/**
 * ### ToolErrorCode
 *
 * A work tool's failure that mothership itself recognized, sent beside the
 * tool's raw message so the browser never parses it:
 * - `rate-limited`: the tool is rate limiting and mothership is holding calls (status 429).
 * - `timed-out`: the tool gave no answer before mothership's deadline (status 504).
 * - `connector-not-connected`: the claude.ai connector the tool is read through is not connected to the Claude account; `connector` names it.
 * - `claude-login`, `claude-limit`: Claude refused the session that reads the tool through a claude.ai connector (see {@link ClaudeErrorCode}).
 */
export type ToolErrorCode = RateLimitedCode | "timed-out" | "connector-not-connected" | "claude-login" | "claude-limit";

/**
 * ### ToolUnavailableCode
 *
 * Why a work tool can't be reached (the `code` of `UnavailableReason`), sent
 * with status 409 when a route asks a tool that is not set up.
 */
export type ToolUnavailableCode = "turned-off" | "not-connected" | "no-server" | "mcp-config-unreadable" | "no-widget";

/**
 * ### ClaudeErrorCode
 *
 * Why a call to Claude failed:
 * - `claude-login`: Claude refused your login; the browser offers to log in again.
 * - `claude-limit`: a usage or spend limit is used up; the message is Claude's own text.
 * - `probe-timeout`: the limits check took too long.
 * - `claude-no-limits`: Claude reports no plan limits (no claude.ai subscription login).
 */
export type ClaudeErrorCode = "claude-login" | "claude-limit" | "probe-timeout" | "claude-no-limits";

/**
 * ### DockerErrorCode
 *
 * Why a `docker` call failed:
 * - `missing`: the Docker CLI is not installed.
 * - `daemon`: the CLI is installed but the Docker daemon is not running.
 * - `failed`: anything else (invalid output, command error).
 */
export type DockerErrorCode = "missing" | "daemon" | "failed";

/**
 * ### GhErrorCode
 *
 * Why a `gh` call failed:
 * - `missing`: the GitHub CLI is not installed.
 * - `auth`: it is installed but not logged in.
 * - `failed`: anything else (unknown repository, network, invalid output).
 */
export type GhErrorCode = "missing" | "auth" | "failed";

/**
 * ### ImportErrorCode
 *
 * Why `/api/import` failed: `list-failed` (the provider's sessions could not
 * be listed), `not-recent` (the session is no longer among the recent ones),
 * `folder-gone` (its folder was moved or deleted), `already-imported` (a
 * session of a provider that cannot fork is already in mothership, and a
 * second copy would continue the same thread), `import-failed` (it could
 * not be read or forked). `error` then holds only
 * the underlying reason.
 */
export type ImportErrorCode = "list-failed" | "not-recent" | "folder-gone" | "already-imported" | "import-failed";

/**
 * ### KakaoErrorCode
 *
 * Why reading or opening KakaoTalk failed:
 * - `missing`: KakaoTalk is not installed (or would not open).
 * - `unsupported`: a Mac-only action on another system.
 * - `moved`: the chat is no longer where the list showed it.
 * - `read-failed` / `open-failed`: the script failed; the message is its own output.
 * - `accessibility` / `automation`: opening a chat was refused that macOS permission.
 */
export type KakaoErrorCode = "missing" | "unsupported" | "moved" | "read-failed" | "open-failed" | "accessibility" | "automation";

/**
 * ### GoogleOAuthCode
 *
 * Why one of the app's own Google sign-ins failed: no usable OAuth client
 * (`unconfigured`), nobody signed in (`disconnected`), Google stopped
 * accepting the sign-in (`expired`), or anything else (`failed`).
 */
export type GoogleOAuthCode = "unconfigured" | "disconnected" | "expired" | "failed";

/**
 * ### GoogleClientProblem
 *
 * Why there is no usable Google OAuth client: none is chosen
 * (`client-missing`), the saved file is gone or unreadable
 * (`client-unreadable`), or it is not an OAuth client file (`client-invalid`).
 */
export type GoogleClientProblem = "client-missing" | "client-unreadable" | "client-invalid";

/**
 * ### GoogleSignInFailureCode
 *
 * Why the Google sign-in Settings runs for you stopped:
 * - `sign-in-timed-out`: the sign-in page was left open too long.
 * - `sign-in-not-started`: the sign-in command could not be started.
 * - `sign-in-stopped`: the command exited without signing in.
 */
export type GoogleSignInFailureCode = "sign-in-timed-out" | "sign-in-not-started" | "sign-in-stopped";

/**
 * ### GoogleOAuthSignInFailureCode
 *
 * Why one of the app's own Google sign-ins (Gmail, YouTube Music) came
 * back without being kept:
 * - `sign-in-timed-out`: Google sent you back more than ten minutes after it began.
 * - `sign-in-unknown`: Google sent back a sign-in this server did not start (or one already ended).
 * - `no-refresh-token`: Google answered without a refresh token, so the sign-in could not last.
 * - `disconnected-meanwhile`: you disconnected while Google answered, so nothing was kept.
 * - `denied`: Google did not finish it (you cancelled, or the account was turned away).
 * - `sign-in-failed`: anything else, such as Google refusing the code or not answering.
 */
export type GoogleOAuthSignInFailureCode = "sign-in-timed-out" | "sign-in-unknown" | "no-refresh-token" | "disconnected-meanwhile" | "denied" | "sign-in-failed";

/**
 * ### GoogleOAuthSignInFailure
 *
 * A {@link GoogleOAuthSignInFailureCode} with `detail`: Google's own words
 * (its `error` and `error_description`) or the underlying error, when there are any.
 */
export type GoogleOAuthSignInFailure = { code: GoogleOAuthSignInFailureCode; detail?: string };

/**
 * ### GmailErrorCode
 *
 * Why a Gmail call failed: a {@link GoogleOAuthCode}, or
 * - `api-disabled`: the Gmail API is off in the client's Google Cloud project.
 * - `scope`: the sign-in lacks Gmail read access (it was made without it, or you unticked it on Google's page).
 * - `quota`: Google is limiting calls for now.
 * - `not-found`: the message is gone (deleted, or in another account).
 * - `unreachable`: Gmail could not be reached or did not answer in time.
 */
export type GmailErrorCode = GoogleOAuthCode | "api-disabled" | "scope" | "quota" | "not-found" | "unreachable";

/**
 * ### YouTubeMusicErrorCode
 *
 * Why a YouTube Music call failed: a {@link GoogleOAuthCode}, or
 * - `api-disabled`: the YouTube Data API v3 is off in the client's Google Cloud project.
 * - `quota`: the day's Data API quota is used up.
 * - `no-channel`: the Google account you signed in with has no YouTube channel,
 *   so YouTube lists no playlists for it (usually the wrong account was picked).
 * - `unreachable`: YouTube could not be reached or did not answer in time.
 */
export type YouTubeMusicErrorCode = GoogleOAuthCode | "api-disabled" | "quota" | "no-channel" | "unreachable";

/**
 * ### FeedbackErrorCode
 *
 * Why feedback cannot start a session (status 409): developer mode is off
 * (`developer-off`), or mothership's source folder is not known (`no-source-folder`).
 */
export type FeedbackErrorCode = "developer-off" | "no-source-folder";

/**
 * ### ExplorerErrorCode
 *
 * Why the Explorer or a file tab can't show or open a path (`FilesError`):
 * - `secret-path`: the path may hold secrets, so it is never shown or opened.
 * - `binary-file`: the file looks binary and can't be previewed as text.
 * - `file-too-large`: the file is over the viewer's 50 MB limit.
 * - `type-not-viewable`: the viewer can't show this file type as it is.
 * - `path-missing`: nothing exists at the path.
 * - `path-outside`: the path (or a symlink in it) leads outside the folder being browsed.
 * - `not-a-file` / `not-a-folder`: the path is the other kind.
 * - `folder-gone`: the folder being browsed (a session's or the workspace) no longer exists.
 * - `home-too-large`: the whole home folder was asked for at once.
 */
export type ExplorerErrorCode =
  | "secret-path"
  | "binary-file"
  | "file-too-large"
  | "type-not-viewable"
  | "path-missing"
  | "path-outside"
  | "not-a-file"
  | "not-a-folder"
  | "folder-gone"
  | "home-too-large";

/**
 * ### ErrorCode
 *
 * Any `code` a route sends with an error. {@link ApiErrorCode}s are worded
 * by every screen; the others by the screens of the feature that sends them.
 */
export type ErrorCode =
  | ApiErrorCode
  | ToolErrorCode
  | ToolUnavailableCode
  | ClaudeErrorCode
  | DockerErrorCode
  | GhErrorCode
  | ImportErrorCode
  | KakaoErrorCode
  | GoogleOAuthCode
  | GmailErrorCode
  | YouTubeMusicErrorCode
  | FeedbackErrorCode
  | ExplorerErrorCode;
