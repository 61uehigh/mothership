import { gemoji } from "gemoji";

// Slack's names (from iamcal's emoji-data) that neither gemoji's names nor its Unicode descriptions give.
const SLACK_ONLY: Record<string, string> = {
  simple_smile: "🙂",
  hugging_face: "🤗",
  white_frowning_face: "☹️",
  "grinning_face_with_star_eyes": "🤩",
  face_palm: "🤦",
};

/** Normalizes a name the way both sources can be matched: lower case, `-` and spaces as `_`. */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9+]+/g, "_").replace(/^_|_$/g, "");

// GitHub's names and aliases (`+1`, `thumbsup`, `white_check_mark`), which Slack mostly shares,
// then the Unicode names (`thinking_face`), which Slack uses where GitHub differs.
const EMOJI = new Map<string, string>();
for (const entry of gemoji) for (const name of entry.names) EMOJI.set(key(name), entry.emoji);
for (const entry of gemoji) if (!EMOJI.has(key(entry.description))) EMOJI.set(key(entry.description), entry.emoji);
for (const [name, emoji] of Object.entries(SLACK_ONLY)) if (!EMOJI.has(name)) EMOJI.set(name, emoji);

/**
 * ### QUICK_REACTIONS
 *
 * The emoji offered by the reaction picker, as shortcode names.
 */
export const QUICK_REACTIONS = ["+1", "eyes", "white_check_mark", "raised_hands", "joy", "tada", "heart", "pray", "fire", "thinking_face"];

/**
 * ### emojiFor
 *
 * @param name - A Slack or GitHub shortcode name without colons; Slack skin
 *   tones (`+1::skin-tone-3`) are dropped.
 * @returns The emoji character, or `undefined` for a custom or unknown name.
 */
export function emojiFor(name: string): string | undefined {
  return EMOJI.get(key(name.split("::")[0]));
}

/**
 * ### emojiChar
 *
 * @param name - Shortcode name; see {@link emojiFor}.
 * @returns The emoji character, or `:name:` when unknown, such as a workspace's custom emoji.
 */
export function emojiChar(name: string): string {
  return emojiFor(name) ?? `:${name.split("::")[0]}:`;
}

/**
 * ### replaceEmojiShortcodes
 *
 * Replaces `:name:` shortcodes in Slack text with their emoji, including a
 * skin tone suffix (`:+1::skin-tone-2:`). Custom and unknown names stay as
 * they are, and so does anything in a `code span` or ``` block.
 */
export function replaceEmojiShortcodes(text: string): string {
  // Code (``` blocks, then `spans`) is matched first and kept; only the text between is changed.
  return text.replace(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)|:([a-z0-9_+'-]+):(?::skin-tone-\d:)?/gi, (match, code: string | undefined, name: string | undefined) => {
    if (code !== undefined || name === undefined) return match;
    return emojiFor(name) ?? match;
  });
}
