import type { KakaoChat } from "@/features/kakaotalk/model/KakaoTalk";

/**
 * ### AxText
 *
 * One piece of text found in a row of the KakaoTalk window, with the
 * accessibility role of the element that holds it.
 */
export type AxText = { role: string; text: string };

/**
 * ### AxTable
 *
 * The rows of one table in the KakaoTalk window, each as the texts inside it in order.
 */
export type AxTable = { rows: Array<Array<AxText>> };

/**
 * How the app writes when a chat's last message came: a clock time
 * ("오후 3:12", "3:12 PM", "15:12"), a day ("어제", "Yesterday", "월요일",
 * "Monday"), or a date ("11월 3일", "2025. 11. 3.", "Nov 3", "15 Nov", "11/3").
 */
const TIME_PATTERNS = [
  /^(오전|오후)\s?\d{1,2}:\d{2}$/,
  /^\d{1,2}:\d{2}(\s?[AP]M)?$/i,
  /^[AP]M\s?\d{1,2}:\d{2}$/i,
  /^(어제|그저께|Yesterday)$/i,
  /^[월화수목금토일]요일$/,
  /^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day$/i,
  /^\d{1,2}월\s?\d{1,2}일$/,
  /^\d{4}[./-]\s?\d{1,2}[./-]\s?\d{1,2}\.?$/,
  /^\d{1,2}[./]\s?\d{1,2}\.?$/,
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(, \d{4})?$/i,
  /^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?( \d{4})?$/i,
];

/** A count as the app writes it on a badge or next to a group's name ("3", "999+"). */
const COUNT = /^\d{1,5}\+?$/;
const TEXT_ROLES = new Set(["AXStaticText", "AXTextArea", "AXTextField"]);

/**
 * ### isChatTime
 *
 * @returns Whether `text` looks like the time of a chat's last message.
 */
export function isChatTime(text: string): boolean {
  const trimmed = text.trim();
  return TIME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const count = (text: string) => Number.parseInt(text, 10);

/**
 * ### parseChatRow
 *
 * Reads one chat-list row. The app lays a row out as the room's name, the
 * member count of a group chat, the last message, its time, and an unread
 * badge; the order of the texts follows that layout.
 *
 * @returns The chat, or `undefined` when the row has no name or neither a
 *   time nor a message (a header, a folder, or another kind of list).
 */
export function parseChatRow(texts: Array<AxText>, at: KakaoChat["at"]): KakaoChat | undefined {
  const items = texts.map((item) => ({ role: item.role, text: item.text.trim() })).filter((item) => item.text !== "");
  const nameIndex = items.findIndex((item) => TEXT_ROLES.has(item.role) && !isChatTime(item.text) && !COUNT.test(item.text));
  if (nameIndex === -1) return undefined;
  const name = items[nameIndex].text;
  const after = items.slice(nameIndex + 1);

  // A count right after the name is a group's member count; a later one is the unread badge.
  const membersText = after[0] !== undefined && COUNT.test(after[0].text) ? after[0].text : undefined;
  const rest = membersText === undefined ? after : after.slice(1);
  const time = rest.find((item) => isChatTime(item.text))?.text;
  const unreadText = rest.find((item) => COUNT.test(item.text))?.text;
  const others = rest.filter((item) => item.text !== time && !COUNT.test(item.text) && TEXT_ROLES.has(item.role));
  // The message is a text view (AXTextArea) in the app; fall back to the longest other text.
  const lastMessage = others.find((item) => item.role === "AXTextArea")?.text ?? others.reduce<string | undefined>((longest, item) => (longest === undefined || item.text.length > longest.length ? item.text : longest), undefined);

  if (time === undefined && lastMessage === undefined) return undefined;
  return {
    name,
    members: membersText === undefined ? undefined : count(membersText),
    lastMessage,
    time,
    unread: unreadText === undefined ? undefined : count(unreadText),
    at,
  };
}

/**
 * ### pickChatList
 *
 * Finds the chat list among the tables of the KakaoTalk window (the friends
 * list is a table too): the one with the most rows that carry a time.
 *
 * @returns The chats in the app's order, or `undefined` when no table looks like a chat list.
 */
export function pickChatList(tables: Array<AxTable>): Array<KakaoChat> | undefined {
  let best: Array<KakaoChat> | undefined;
  let bestScore = 0;
  tables.forEach((table, tableIndex) => {
    const chats = table.rows.flatMap((row, rowIndex) => parseChatRow(row, { table: tableIndex, row: rowIndex }) ?? []);
    const score = chats.filter((chat) => chat.time !== undefined).length;
    if (score > bestScore) {
      best = chats;
      bestScore = score;
    }
  });
  return best;
}

/**
 * ### parseDockBadge
 *
 * Reads the unread total from `lsappinfo info -only StatusLabel` output,
 * such as `"StatusLabel"={ "label"="12" }`.
 *
 * @returns The count; 0 when the badge is empty; `undefined` when the output has no badge at all.
 */
export function parseDockBadge(output: string): number | undefined {
  if (!output.includes("StatusLabel")) return undefined;
  const label = /"label"="([^"]*)"/.exec(output)?.[1];
  if (label === undefined || label === "") return 0;
  const value = Number.parseInt(label, 10);
  return Number.isNaN(value) ? undefined : value;
}
