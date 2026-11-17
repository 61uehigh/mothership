import { z } from "zod";
import { gmailThreadUrl, type MailBody, type MailDetail, type MailFilter, type MailSummary } from "@/features/gmail/model/Gmail";
import { GmailError } from "@/features/gmail/server/GmailError";
import { unescapeHtml } from "@/lib/html";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 15_000;
/** A body larger than this is cut, so one newsletter cannot fill the tab (or the server's memory). */
const MAX_BODY_CHARS = 400_000;

const headerSchema = z.object({ name: z.string(), value: z.string() });

type Part = {
  mimeType?: string;
  filename?: string;
  headers?: Array<z.infer<typeof headerSchema>>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: Array<Part>;
};

const partSchema: z.ZodType<Part> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(headerSchema).optional(),
    body: z.object({ data: z.string().optional(), size: z.number().optional(), attachmentId: z.string().optional() }).optional(),
    parts: z.array(partSchema).optional(),
  }),
);

const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).default([]),
  snippet: z.string().default(""),
  internalDate: z.string().optional(),
  payload: partSchema.optional(),
});

const listSchema = z.object({ messages: z.array(z.object({ id: z.string(), threadId: z.string() })).default([]) });

/**
 * ### decodeEncodedWords
 *
 * Decodes RFC 2047 encoded words (`=?UTF-8?B?…?=`, `=?euc-kr?Q?…?=`) in a
 * header. Gmail usually decodes them already; a sender's broken header can
 * still come through. An unknown charset leaves the word as it is.
 */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (word, charset: string, encoding: string, text: string) => {
      try {
        const bytes =
          encoding.toUpperCase() === "B"
            ? Buffer.from(text, "base64")
            : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return word;
      }
    });
}

/**
 * ### parseAddress
 *
 * Splits a `From` header such as `"Kim, Ada" <ada@example.com>` into the
 * name to show and the address.
 *
 * @returns The name (the address when there is no name), and the address when there is one.
 */
export function parseAddress(header: string): { name: string; email: string | undefined } {
  const value = decodeEncodedWords(header).trim();
  const angle = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  if (angle !== null) {
    const name = (angle[1] ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim();
    const email = angle[2] ?? "";
    return { name: name === "" ? email : name, email };
  }
  return /^[^\s@]+@[^\s@]+$/.test(value) ? { name: value, email: value } : { name: value, email: undefined };
}

function header(part: Part | undefined, name: string): string | undefined {
  const lower = name.toLowerCase();
  return part?.headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

/** The part's charset, from its own `Content-Type` header; UTF-8 when it names none. */
function charsetOf(part: Part): string {
  return /charset\s*=\s*"?([\w.:-]+)"?/i.exec(header(part, "Content-Type") ?? "")?.[1]?.toLowerCase() ?? "utf-8";
}

function decodeData(data: string, charset: string): string {
  const bytes = Buffer.from(data, "base64url");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Every leaf part, depth first, in the order the sender wrote them. */
function leaves(part: Part): Array<Part> {
  return part.parts === undefined || part.parts.length === 0 ? [part] : part.parts.flatMap(leaves);
}

/**
 * ### mailBody
 *
 * The body to show from a message's MIME tree: the HTML part when there is
 * one, else the plain text joined, else Gmail's snippet. Attachments (parts
 * with a file name) are named, not read.
 *
 * @param snippet - Shown as text when the message has no readable body.
 */
export function mailBody(payload: Part | undefined, snippet: string): { body: MailBody; attachments: Array<string> } {
  const parts = payload === undefined ? [] : leaves(payload);
  const attachments = parts.flatMap((p) => (p.filename !== undefined && p.filename !== "" ? [p.filename] : []));
  const inline = parts.filter((p) => (p.filename ?? "") === "" && p.body?.data !== undefined);
  const html = inline.find((p) => p.mimeType === "text/html");
  if (html?.body?.data !== undefined) return { body: { kind: "html", html: decodeData(html.body.data, charsetOf(html)).slice(0, MAX_BODY_CHARS) }, attachments };
  const text = inline
    .filter((p) => p.mimeType === "text/plain")
    .map((p) => decodeData(p.body?.data ?? "", charsetOf(p)))
    .join("\n\n");
  return { body: { kind: "text", text: (text === "" ? unescapeHtml(snippet) : text).slice(0, MAX_BODY_CHARS) }, attachments };
}

/**
 * ### parseSummary
 *
 * @param json - `messages.get` in `metadata` (or `full`) format.
 */
export function parseSummary(json: unknown): MailSummary {
  const message = parse(messageSchema, json, "a message");
  const from = parseAddress(header(message.payload, "From") ?? "");
  const subject = decodeEncodedWords(header(message.payload, "Subject") ?? "").trim();
  const internal = Number(message.internalDate);
  const dated = Date.parse(header(message.payload, "Date") ?? "");
  return {
    id: message.id,
    threadId: message.threadId,
    from: from.name,
    fromEmail: from.email,
    subject,
    snippet: unescapeHtml(message.snippet),
    at: Number.isFinite(internal) && internal > 0 ? internal : Number.isFinite(dated) ? dated : 0,
    unread: message.labelIds.includes("UNREAD"),
    important: message.labelIds.includes("IMPORTANT"),
  };
}

/**
 * ### parseDetail
 *
 * @param json - `messages.get` in `full` format.
 * @param email - The signed-in address, for the link into Gmail.
 */
export function parseDetail(json: unknown, email: string | undefined): MailDetail {
  const summary = parseSummary(json);
  const { payload } = parse(messageSchema, json, "a message");
  const optional = (name: string) => {
    const value = header(payload, name);
    return value === undefined ? undefined : decodeEncodedWords(value);
  };
  return { ...summary, to: optional("To"), cc: optional("Cc"), ...mailBody(payload, summary.snippet), url: gmailThreadUrl(email, summary.threadId) };
}

function parse<T>(schema: z.ZodType<T>, json: unknown, what: string): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new GmailError(`Gmail answered ${what} in an unexpected shape: ${z.prettifyError(parsed.error)}`, 502, "failed");
  return parsed.data;
}

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string() })).default([]),
    details: z.array(z.object({ reason: z.string().optional() })).default([]),
  }),
});

/**
 * ### gmailFailure
 *
 * Turns a failed Gmail API answer into a {@link GmailError} whose code says what to do.
 *
 * @param body - The answer's JSON, when it had any.
 */
export function gmailFailure(status: number, body: unknown): GmailError {
  const error = errorSchema.safeParse(body);
  const reasons = error.success ? [...error.data.error.errors.map((e) => e.reason), error.data.error.status ?? "", ...error.data.error.details.map((d) => d.reason ?? "")] : [];
  const message = error.success ? error.data.error.message : `status ${status}`;
  if (status === 401) return new GmailError(`Google no longer accepts the Gmail sign-in: it expired or was revoked (${message})`, 401, "expired");
  // Google's own message names the project and links the API's page; Settings turns it into an Enable button.
  if (reasons.some((r) => r === "accessNotConfigured" || r === "SERVICE_DISABLED") || /has not been used in project|is disabled/i.test(message)) {
    return new GmailError(message, 409, "api-disabled");
  }
  if (reasons.some((r) => r === "insufficientPermissions" || r === "ACCESS_TOKEN_SCOPE_INSUFFICIENT") || /insufficient (authentication )?scopes?/i.test(message)) {
    return new GmailError(`The Gmail sign-in lacks read access to your mail; sign in again and allow it (${message})`, 403, "scope");
  }
  if (status === 429 || reasons.some((r) => /rateLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED/.test(r))) {
    return new GmailError(`Gmail is limiting requests for now (${message})`, 429, "quota");
  }
  if (status === 404) return new GmailError("That message is gone from Gmail", 404, "not-found");
  return new GmailError(`Gmail: ${message}`, 502, "failed");
}

/**
 * ### gmailGet
 *
 * One Gmail API read with your access token.
 *
 * @throws GmailError See {@link gmailFailure}; `unreachable` when Gmail cannot be reached.
 */
export async function gmailGet(token: string, resource: string, params: URLSearchParams = new URLSearchParams()): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API}/${resource}?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new GmailError(timedOut ? "Gmail did not answer in time" : "Could not reach Gmail", timedOut ? 504 : 502, "unreachable");
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok) return body;
  throw gmailFailure(response.status, body);
}

/**
 * ### listInbox
 *
 * The inbox's newest messages: one list call, then each message's headers
 * (Gmail has no list call that includes them). About 5 + 5×`max` quota units
 * of the 250 a user may spend each second.
 *
 * @param filter - `unread` for unread messages only.
 */
export async function listInbox(token: string, filter: MailFilter, max: number): Promise<Array<MailSummary>> {
  const params = new URLSearchParams({ labelIds: "INBOX", maxResults: String(max) });
  if (filter === "unread") params.set("q", "is:unread");
  const { messages } = parse(listSchema, await gmailGet(token, "messages", params), "the message list");
  const metadata = new URLSearchParams({ format: "metadata" });
  for (const name of ["From", "Subject", "Date"]) metadata.append("metadataHeaders", name);
  const summaries = await Promise.all(
    messages.map((m) =>
      gmailGet(token, `messages/${encodeURIComponent(m.id)}`, metadata).then(parseSummary, (error: unknown) => {
        // Deleted between the two calls: leave it out rather than failing the whole list.
        if (error instanceof GmailError && error.code === "not-found") return undefined;
        throw error;
      }),
    ),
  );
  return summaries.filter((s) => s !== undefined).sort((a, b) => b.at - a.at);
}

/**
 * ### readMessage
 *
 * One message in full.
 *
 * @param email - The signed-in address, for the link into Gmail.
 * @throws GmailError With code `not-found` when there is no such message.
 */
export async function readMessage(token: string, id: string, email: string | undefined): Promise<MailDetail> {
  return parseDetail(await gmailGet(token, `messages/${encodeURIComponent(id)}`, new URLSearchParams({ format: "full" })), email);
}

const labelSchema = z.object({ messagesUnread: z.number().optional() });

/**
 * ### unreadCount
 *
 * @returns How many messages in the inbox are unread, as Gmail counts them.
 */
export async function unreadCount(token: string): Promise<number> {
  return parse(labelSchema, await gmailGet(token, "labels/INBOX"), "the inbox label").messagesUnread ?? 0;
}

const profileSchema = z.object({ emailAddress: z.string() });

/**
 * ### gmailAddress
 *
 * @returns The signed-in account's address.
 */
export async function gmailAddress(token: string): Promise<string> {
  return parse(profileSchema, await gmailGet(token, "profile"), "your profile").emailAddress;
}
