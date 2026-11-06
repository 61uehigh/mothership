// Common shortcode names as Slack and Linear store them; anything else is shown as :name:.
const EMOJI: Record<string, string> = {
  "+1": "👍",
  thumbsup: "👍",
  "-1": "👎",
  eyes: "👀",
  ok_hand: "👌",
  pray: "🙏",
  heart: "❤️",
  joy: "😂",
  smile: "😄",
  laughing: "😆",
  astonished: "😲",
  face_with_raised_eyebrow: "🤨",
  thinking_face: "🤔",
  fire: "🔥",
  tada: "🎉",
  clap: "👏",
  raised_hands: "🙌",
  white_check_mark: "✅",
  heavy_check_mark: "✔️",
  rocket: "🚀",
  "100": "💯",
  sob: "😭",
  muscle: "💪",
  saluting_face: "🫡",
};

/**
 * ### QUICK_REACTIONS
 *
 * The emoji offered by the reaction picker, as shortcode names.
 */
export const QUICK_REACTIONS = ["+1", "eyes", "white_check_mark", "raised_hands", "joy", "tada", "heart", "pray", "fire", "thinking_face"];

/**
 * ### emojiChar
 *
 * @param name - Shortcode name; Slack skin tones (`+1::skin-tone-3`) are dropped.
 * @returns The emoji character, or `:name:` when unknown.
 */
export function emojiChar(name: string): string {
  const base = name.split("::")[0];
  return EMOJI[base] ?? `:${base}:`;
}
