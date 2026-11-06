import { describe, expect, it } from "vitest";
import { emojiChar, replaceEmojiShortcodes } from "@/features/tools/model/emoji";

describe("emojiChar", () => {
  it("knows GitHub's aliases and Slack's Unicode-style names", () => {
    expect(["+1", "thumbsup", "-1", "white_check_mark", "heavy_check_mark", "thinking_face", "face_with_raised_eyebrow", "man-facepalming", "simple_smile"].map(emojiChar)).toEqual(
      ["👍", "👍", "👎", "✅", "✔️", "🤔", "🤨", "🤦‍♂️", "🙂"],
    );
  });

  it("drops a skin tone and keeps custom names as :name:", () => {
    expect(emojiChar("+1::skin-tone-3")).toBe("👍");
    expect(emojiChar("party-parrot")).toBe(":party-parrot:");
  });
});

describe("replaceEmojiShortcodes", () => {
  it("replaces standard shortcodes, with or without a skin tone", () => {
    expect(replaceEmojiShortcodes(":white_check_mark: Done :+1::skin-tone-2: :tada:")).toBe("✅ Done 👍 🎉");
  });

  it("leaves custom emoji, times, and code alone", () => {
    expect(replaceEmojiShortcodes(":party-parrot: at 10:30:45")).toBe(":party-parrot: at 10:30:45");
    expect(replaceEmojiShortcodes("`:fire:` and :fire:")).toBe("`:fire:` and 🔥");
    expect(replaceEmojiShortcodes("```\n:fire:\n```\n:fire:")).toBe("```\n:fire:\n```\n🔥");
  });
});
