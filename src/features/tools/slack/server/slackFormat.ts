// Slack text helpers shared by the dashboard source (search hits) and the thread detail.
import { replaceEmojiShortcodes } from "@/features/tools/model/emoji";
import { mentionLink } from "@/features/tools/server/sourceUtils";

const TIME_ZONE_OFFSETS: Record<string, string> = { KST: "+09:00", UTC: "Z", GMT: "Z" };

/**
 * ### SlackMarkupRules
 *
 * How {@link replaceSlackMarkup} renders each kind of Slack markup.
 */
export type SlackMarkupRules = {
  /**
   * ### user
   *
   * A user mention: `<@U1|Name>` (with `name`) or `<@U1>` (without).
   */
  user: (id: string, name: string | undefined) => string;
  /**
   * ### link
   *
   * A link: `<url|label>` (with `label`) or `<url>` (without).
   */
  link: (url: string, label: string | undefined) => string;
  /**
   * ### group
   *
   * A user group, `<!subteam^S1|@team>`, with the leading `@` dropped. When
   * omitted, the group's label is kept as it is.
   */
  group?: (name: string) => string;
  /**
   * ### broadcast
   *
   * `<!here>`, `<!channel>`, or `<!everyone>`, with or without a label. When
   * omitted, the label is kept, or `@name` without one.
   */
  broadcast?: (name: string) => string;
};

/**
 * ### replaceSlackMarkup
 *
 * Replaces Slack's `<…>` markup: mentions and links as `rules` say, channel
 * links `<#C1|chan>` as `#chan`, other `<!…|label>` as the label and `<!x>`
 * as `@x`. Leaves everything else, including whitespace, as it is.
 */
export function replaceSlackMarkup(text: string, rules: SlackMarkupRules): string {
  let out = text
    .replace(/<@(\w+)\|([^>]+)>/g, (_, id: string, name: string) => rules.user(id, name))
    .replace(/<@(\w+)>/g, (_, id: string) => rules.user(id, undefined))
    .replace(/<#\w+\|([^>]+)>/g, "#$1");
  const { group, broadcast } = rules;
  if (group !== undefined) out = out.replace(/<!subteam\^\w+\|@?([^>]+)>/g, (_, name: string) => group(name));
  if (broadcast !== undefined) out = out.replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, (_, name: string) => broadcast(name));
  return (
    out
      // Remaining broadcasts and user groups: <!here>, <!channel>, <!subteam^S1|@team>.
      .replace(/<!\w+(?:\^\w+)?\|([^>]+)>/g, "$1")
      .replace(/<!(\w+)>/g, "@$1")
      .replace(/<(https?:[^|>]+)\|([^>]+)>/g, (_, url: string, label: string) => rules.link(url, label))
      .replace(/<(https?:[^>]+)>/g, (_, url: string) => rules.link(url, undefined))
  );
}

/**
 * ### unquoteSlackBody
 *
 * The Slack MCP server prints each message's text as a quote, every line
 * starting with `> `. Takes that one level off; a quote inside the message
 * keeps its own `>`. Text that is not quoted throughout is left as it is.
 */
export function unquoteSlackBody(body: string): string {
  const lines = body.split("\n");
  const quoted = lines.filter((l) => l.trim() !== "").every((l) => l.startsWith(">"));
  return quoted ? lines.map((l) => l.replace(/^> ?/, "")).join("\n") : body;
}

/**
 * ### cleanSlackText
 *
 * Turns Slack mrkdwn escapes into readable text: `<@U1|Name>` → `@Name`,
 * `<url|label>` → `label`, `<#C1|chan>` → `#chan`, `:tada:` → 🎉.
 *
 * @returns Single-line text.
 */
export function cleanSlackText(text: string): string {
  return replaceSlackMarkup(replaceEmojiShortcodes(text), {
    user: (id, name) => `@${name ?? id}`,
    link: (url, label) => label ?? url,
  })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ### slackToMarkdown
 *
 * Converts Slack mrkdwn to Markdown, keeping line breaks. User mentions
 * become `mention:` links (see {@link mentionLink}): yours when the id is
 * `me`, and `@here` / `@channel` / `@everyone` count as yours since they
 * notify you. Channel links become `#channel`, `<url|label>` becomes a link,
 * `*bold*` and `~strike~` become their Markdown forms, and Slack's bulleted
 * and numbered lists become Markdown lists (see {@link slackListsToMarkdown}),
 * and standard `:emoji:` shortcodes become the emoji.
 *
 * @param me - Your Slack member id, when known.
 */
export function slackToMarkdown(text: string, me?: string): string {
  return replaceSlackMarkup(slackListsToMarkdown(replaceEmojiShortcodes(text)), {
    user: (id, name) => mentionLink(name ?? id, id === me),
    group: (name) => mentionLink(name, false),
    broadcast: (name) => mentionLink(name, true),
    link: (url, label) => (label === undefined ? `<${url}>` : `[${label}](${url})`),
  })
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1**$2**")
    .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?:;]|$)/g, "$1~~$2~~")
    // A lone `---` would turn the line above into a heading.
    .replace(/^---$/gm, "\n---\n")
    // Slack line breaks are hard breaks; Markdown needs two trailing spaces for that.
    .replace(/([^\n])\n(?=[^\n])/g, "$1  \n")
    .trim();
}

// Slack draws list levels with these bullets (•, ◦, ▪ in turn); ▪ may carry a text-style selector.
const LIST_ITEM = /^([ \t]*)(?:([•◦▪▫‣⁃●○■□-])[︎️]?|(\d+)\.)[ \t]+(?=\S)/;

/** The width of leading whitespace, a tab counting as four spaces. */
function indentWidth(space: string): number {
  return [...space].reduce((width, c) => width + (c === "\t" ? 4 : 1), 0);
}

/**
 * ### slackListsToMarkdown
 *
 * Turns the lists in Slack text into Markdown lists, keeping their levels.
 * Slack (and its MCP server) writes a list as lines that start with a
 * bullet — `•`, then `◦`, then `▪` — or a number, nested by leading spaces
 * or tabs. Markdown would show those as one flat paragraph, or code. Each
 * item becomes `- ` or `n. `, indented four spaces per level, and a list
 * gets blank lines around it so it neither joins the text nor swallows it.
 * Other lines, and lines in ``` code blocks, are left as they are.
 */
export function slackListsToMarkdown(text: string): string {
  const out: Array<string> = [];
  // The indent widths of the open levels, outermost first.
  let levels: Array<number> = [];
  let inList = false;
  let inCode = false;
  for (const line of text.split("\n")) {
    // Inside a ``` block nothing is a list; a line with an odd number of fences opens or closes one.
    const fenced = inCode;
    if ((line.match(/```/g)?.length ?? 0) % 2 === 1) inCode = !inCode;
    const item = fenced || inCode ? null : LIST_ITEM.exec(line);
    if (item === null) {
      if (inList && line.trim() !== "") out.push("");
      inList = false;
      levels = [];
      out.push(line);
      continue;
    }
    const width = indentWidth(item[1]);
    while (levels.length > 0 && levels[levels.length - 1] > width) levels.pop();
    if (levels.length === 0 || levels[levels.length - 1] < width) levels.push(width);
    if (!inList && out.length > 0 && out[out.length - 1].trim() !== "") out.push("");
    inList = true;
    const marker = item[3] === undefined ? "-" : `${item[3]}.`;
    out.push(`${" ".repeat(4 * (levels.length - 1))}${marker} ${line.slice(item[0].length)}`);
  }
  return out.join("\n");
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const objects = (value: unknown): Array<Json> => (Array.isArray(value) ? value.filter(isObject) : []);
/** A non-empty string or number at `key`, as trimmed text. */
function textAt(value: unknown, key: string): string | undefined {
  const field = isObject(value) ? value[key] : undefined;
  const text = typeof field === "number" ? String(field) : typeof field === "string" ? field.trim() : "";
  return text === "" ? undefined : text;
}
/** A Block Kit text object (`{ type, text }`) or plain string. */
const blockText = (value: unknown): string | undefined => (typeof value === "string" ? value.trim() || undefined : textAt(value, "text"));

/** A title, linked when there is a link. Slack mrkdwn, like the rest of the card. */
const linkedTitle = (title: string, url: string | undefined) => `*${url === undefined ? title : `<${url}|${title}>`}*`;

/** `snake_case` or `camelCase` keys as words: `due_date` → `Due date`. */
function keyLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A Work Object field's value: text, a tag, or a Slack user. */
function entityValue(field: unknown): string | undefined {
  if (!isObject(field)) return typeof field === "string" || typeof field === "number" ? String(field) : undefined;
  const user = field.user;
  if (isObject(user)) {
    const id = textAt(user, "user_id");
    return id === undefined ? textAt(user, "text") ?? textAt(user, "email") : `<@${id}>`;
  }
  return textAt(field, "value") ?? textAt(field, "text") ?? textAt(field, "alt_text");
}

/** Lines for a Slack Work Object (`metadata.entities[]`): the title, what it is, its fields. */
function entityLines(entity: Json): Array<string> {
  const payload = isObject(entity.entity_payload) ? entity.entity_payload : {};
  const attributes = isObject(payload.attributes) ? payload.attributes : {};
  const title = textAt(attributes.title, "text");
  const url = textAt(entity, "url") ?? textAt(entity, "app_unfurl_url");
  const lines: Array<string> = [];
  if (title !== undefined) lines.push(linkedTitle(title, url));
  const kind = [textAt(attributes, "display_type"), textAt(attributes, "display_id")].filter((s) => s !== undefined).join(" ");
  const product = textAt(attributes, "product_name");
  const subtitle = kind === "" ? product : product === undefined ? kind : `${kind} · ${product}`;
  if (subtitle !== undefined) lines.push(subtitle);
  const fields = isObject(payload.fields) ? payload.fields : {};
  for (const [key, field] of Object.entries(fields)) {
    const value = entityValue(field);
    if (value !== undefined && key !== "description") lines.push(`*${textAt(field, "label") ?? keyLabel(key)}:* ${value}`);
  }
  for (const field of objects(payload.custom_fields)) {
    const value = entityValue(field);
    const label = textAt(field, "label") ?? textAt(field, "key");
    if (value !== undefined && label !== undefined) lines.push(`*${label}:* ${value}`);
  }
  return lines;
}

/**
 * Lines for Block Kit blocks: headers, sections and their fields. Context
 * blocks go to `context`, one entry per element. Actions blocks (buttons,
 * menus) are left out: they cannot be used here.
 */
function blockLines(blocks: unknown, context: Array<string>): Array<string> {
  const lines: Array<string> = [];
  for (const block of objects(blocks)) {
    const text = blockText(block.text);
    if (block.type === "header" && text !== undefined) lines.push(`*${text}*`);
    else if (block.type === "section") {
      if (text !== undefined) lines.push(text);
      for (const field of objects(block.fields)) {
        const value = blockText(field);
        if (value !== undefined) lines.push(value);
      }
    } else if (block.type === "context") {
      context.push(...objects(block.elements).map(blockText).filter((s) => s !== undefined));
    }
  }
  return lines;
}

/** `text` as a Markdown quote of its own, as Slack draws an attachment's text: a bar beside it. */
const quoted = (text: string) => `\n${text.split("\n").map((line) => `> ${line}`).join("\n")}\n`;

/** Lines for a legacy attachment, the shape of most link unfurls and app cards; its footer goes to `context`. */
function attachmentLines(attachment: Json, context: Array<string>): Array<string> {
  const lines: Array<string> = [];
  const add = (line: string | undefined) => {
    if (line !== undefined) lines.push(line);
  };
  add(textAt(attachment, "pretext"));
  add(textAt(attachment, "author_name"));
  const title = textAt(attachment, "title");
  if (title !== undefined) lines.push(linkedTitle(title, textAt(attachment, "title_link") ?? textAt(attachment, "from_url")));
  const text = textAt(attachment, "text");
  if (text !== undefined) lines.push(quoted(text));
  for (const field of objects(attachment.fields)) {
    const label = textAt(field, "title");
    const value = textAt(field, "value");
    if (value !== undefined) lines.push(label === undefined ? value : `*${label}:* ${value}`);
  }
  lines.push(...blockLines(attachment.blocks, context));
  if (lines.length === 0) add(textAt(attachment, "fallback"));
  const footer = textAt(attachment, "footer");
  if (footer !== undefined) context.push(footer);
  return lines;
}

/**
 * ### SlackCard
 *
 * A message's text split the way Slack draws it: the body, and the small
 * muted line under it (context blocks, attachment footers), one entry per
 * element. Both are Slack mrkdwn.
 */
export type SlackCard = { text: string; context: Array<string> };

/**
 * ### slackCard
 *
 * What a Slack message shows besides its text, for a message with no text
 * of its own, such as an app's card or a link unfurl: each Work Object
 * (`metadata.entities`), attachment, and the message's own blocks as a
 * linked bold title, a subtitle, `*Label:* value` lines, and attachment
 * text as a quote. Cards are separated by a blank line; buttons are left out.
 *
 * @param message - A message as Slack's Web API returns it.
 * @returns The card; its `text` is `""` when nothing in it reads as text.
 */
export function slackCard(message: { attachments?: Array<unknown>; blocks?: Array<unknown>; metadata?: unknown }): SlackCard {
  const metadata = isObject(message.metadata) ? message.metadata : {};
  const context: Array<string> = [];
  const cards = [
    ...objects(metadata.entities).map(entityLines),
    ...objects(message.attachments).map((a) => attachmentLines(a, context)),
    blockLines(message.blocks, context),
  ].filter((lines) => lines.length > 0);
  return { text: cards.map((lines) => lines.join("\n")).join("\n\n").replace(/\n{3,}/g, "\n\n").trim(), context };
}

// How the Slack MCP server flattens what is not text: a button as `<label> button`,
// an attachment's text as `Attachment: <text>`.
const BUTTON_LINE = /^(?:\S+ ){0,2}\S+ button$/;
const ATTACHMENT_LINE = /^Attachment: (.*)$/;
// Linear's pull request footer (a context block): `owner/repo#6`, `65 files / ≈ +1002 -880`.
const FOOTER_LINES = [/^[\w.-]+\/[\w.-]+#\d+$/, /^\d+ files? \/ ≈ \+\d+ -\d+$/];

/**
 * ### splitSlackBody
 *
 * Undoes what the Slack MCP server's flattening of a message loses, as far
 * as its text shows: `Attachment: text` becomes a quote, as Slack draws it.
 * For an app or bot, whose messages carry buttons and footers, it also
 * drops `<label> button` lines (they cannot be pressed here) and moves a
 * trailing footer it recognizes (Linear's `owner/repo#6` and diff stats)
 * to `context`. Text from people is left alone apart from the quote, since
 * a line such as "the submit button" is theirs.
 *
 * @param body - Unquoted Slack mrkdwn, as {@link unquoteSlackBody} leaves it.
 */
export function splitSlackBody(body: string, bot: boolean): SlackCard {
  const lines = body
    .split("\n")
    .filter((line) => !(bot && BUTTON_LINE.test(line.trim())))
    .map((line) => {
      const attachment = ATTACHMENT_LINE.exec(line);
      return attachment === null ? line : quoted(attachment[1]);
    });
  const context: Array<string> = [];
  if (bot) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    while (lines.length > 0 && FOOTER_LINES.some((re) => re.test(lines[lines.length - 1].trim()))) context.unshift(lines.pop()!.trim());
  }
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), context };
}

/**
 * ### senderName
 *
 * The display name from a Slack MCP `From:` line such as
 * `Jane Doe <jane@example.com> (ID: U123)` or `Jane Doe (U123)`: drops the
 * address and the member id (and anything after the id).
 *
 * @param from - The line without its `From: ` label.
 */
export function senderName(from: string): string {
  return from
    .replace(/\s*<[^>]*>/, "")
    .replace(/\s*\((?:ID: \w+|U\w+)\).*$/, "")
    .trim();
}

/**
 * ### parseSlackTime
 *
 * Parses a Slack MCP display time such as `2026-10-22 16:31:13 KST`. Only a
 * few zone abbreviations are known, so prefer the exact message ts
 * (`tsToEpoch` in sourceUtils) and use this as a fallback.
 *
 * @returns Epoch milliseconds, or `undefined` for other formats or zones.
 */
export function parseSlackTime(value: string | undefined): number | undefined {
  const match = value === undefined ? null : /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (\w+)$/.exec(value);
  if (match === null) return undefined;
  const offset = TIME_ZONE_OFFSETS[match[3]];
  if (offset === undefined) return undefined;
  const parsed = Date.parse(`${match[1]}T${match[2]}${offset}`);
  return Number.isNaN(parsed) ? undefined : parsed;
}
