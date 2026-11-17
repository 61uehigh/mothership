import type { GmailErrorCode, GoogleClientProblem, GoogleOAuthSignInFailure } from "@/lib/apiErrorCodes";

/**
 * ### MailSummary
 *
 * One message in your Gmail inbox, as the section lists it.
 */
export type MailSummary = {
  /** Gmail's message id. */
  id: string;
  threadId: string;
  /** The sender's name, else their address; empty when the message has no sender, and the browser says so in its language. */
  from: string;
  /** The sender's address; `undefined` when the header has none. */
  fromEmail: string | undefined;
  /** Empty when the message has none; the browser says so in its language. */
  subject: string;
  /** Gmail's short plain-text preview of the body. */
  snippet: string;
  /** Epoch milliseconds Gmail received it. */
  at: number;
  /** Gmail's own unread state (the `UNREAD` label). */
  unread: boolean;
  /** Gmail marked it important (the `IMPORTANT` label). */
  important: boolean;
};

/**
 * ### MailList
 *
 * The inbox's newest messages, and who they were read for.
 */
export type MailList = {
  messages: Array<MailSummary>;
  /** The signed-in address, for links into Gmail's web app. */
  email: string | undefined;
};

/**
 * ### MailBody
 *
 * A message's body: the HTML part when there is one (shown sandboxed), else plain text.
 */
export type MailBody = { kind: "html"; html: string } | { kind: "text"; text: string };

/**
 * ### MailDetail
 *
 * One message in full, for its tab.
 */
export type MailDetail = MailSummary & {
  to: string | undefined;
  cc: string | undefined;
  body: MailBody;
  /** Names of attached files; they are not downloaded here. */
  attachments: Array<string>;
  /** The message's thread in Gmail's web app. */
  url: string;
};

/**
 * ### GmailStatus
 *
 * Whether the section can read your mail.
 * - `unconfigured`: Google Calendar's OAuth client, which Gmail signs in with, is not set; `reason` says why.
 * - `disconnected`: the client is set but you have not signed in to Gmail with it.
 * - `expired`: Google no longer accepts the sign-in (test-mode clients expire weekly).
 * - `connected`: ready.
 */
export type GmailStatus = {
  state: "unconfigured" | "disconnected" | "expired" | "connected";
  reason: GoogleClientProblem | undefined;
  clientSaved: boolean;
  /** The client's Google Cloud project, for links into it. */
  projectId: string | undefined;
  account: string | undefined;
  /** The signed-in Google account's email address. */
  email: string | undefined;
  /** Why the last sign-in came back without being kept. */
  signInError: GoogleOAuthSignInFailure | undefined;
  /** How many sign-ins this server started have ended, so a card tells the one it just began from an earlier one. */
  signInsEnded: number;
};

/**
 * ### GmailTest
 *
 * Settings' "Test connection" result: the account and how many messages are unread in the inbox.
 */
export type GmailTest = { ok: true; who: string | undefined; unread: number } | { ok: false; message: string; code: GmailErrorCode | undefined };

/**
 * ### MAIL_FILTERS
 *
 * What the section lists: the inbox's newest messages, or only the unread ones.
 */
export const MAIL_FILTERS = ["unread", "inbox"] as const;

/**
 * ### MailFilter
 *
 * One of {@link MAIL_FILTERS}.
 */
export type MailFilter = (typeof MAIL_FILTERS)[number];

/**
 * ### gmailThreadUrl
 *
 * Gmail's web page for a thread. Naming the account in the path opens it
 * in that account even when the browser is signed in to several.
 */
export function gmailThreadUrl(email: string | undefined, threadId: string): string {
  return `https://mail.google.com/mail/u/${email === undefined ? "0" : encodeURIComponent(email)}/#all/${encodeURIComponent(threadId)}`;
}

/**
 * ### gmailInboxUrl
 *
 * Gmail's inbox in the web app, for the signed-in account.
 */
export function gmailInboxUrl(email: string | undefined): string {
  return `https://mail.google.com/mail/u/${email === undefined ? "0" : encodeURIComponent(email)}/#inbox`;
}

/**
 * ### gmailApiLibraryUrl
 *
 * The Gmail API's page in Google Cloud's API library, in `projectId` when known.
 */
export function gmailApiLibraryUrl(projectId: string | undefined): string {
  return `https://console.cloud.google.com/apis/library/gmail.googleapis.com${projectId === undefined ? "" : `?project=${encodeURIComponent(projectId)}`}`;
}

/**
 * ### mailDocument
 *
 * A message's HTML as its own document for a sandboxed frame. The policy
 * blocks scripts, forms, and fonts, and remote images (often trackers)
 * until you ask for them; links open in a new tab.
 *
 * Mail is always shown light, on white. The frame element is given
 * `color-scheme: light`, which makes `prefers-color-scheme: dark` in the
 * message (Google Calendar invites have it) not match; the `light only`
 * meta and `:root` rule here, placed before the message's own, keep form
 * controls and scrollbars light even when the message asks for `light dark`.
 * The message's HTML itself is left as sent.
 *
 * @param images - Allow remote images (`https:`/`http:`).
 */
export function mailDocument(html: string, images: boolean): string {
  const policy = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:${images ? " https: http:" : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta http-equiv="Content-Security-Policy" content="${policy}"><base target="_blank"><style>:root{color-scheme:light only !important}body{margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:#18181b;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}
