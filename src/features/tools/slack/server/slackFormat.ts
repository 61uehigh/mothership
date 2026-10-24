// Slack text helpers shared by the dashboard source (search hits) and the thread detail.
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
 * ### cleanSlackText
 *
 * Turns Slack mrkdwn escapes into readable text: `<@U1|Name>` → `@Name`,
 * `<url|label>` → `label`, `<#C1|chan>` → `#chan`.
 *
 * @returns Single-line text.
 */
export function cleanSlackText(text: string): string {
  return replaceSlackMarkup(text, {
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
 * `*bold*` and `~strike~` become their Markdown forms.
 *
 * @param me - Your Slack member id, when known.
 */
export function slackToMarkdown(text: string, me?: string): string {
  return replaceSlackMarkup(text, {
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
