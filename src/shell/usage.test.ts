import { describe, expect, it } from "vitest";
import { actionFeature } from "@/shell/usage";
import { en } from "@/ui/i18n/messages";
import { isMessageKey } from "@/ui/i18n/translate";

describe("actionFeature", () => {
  it("counts a button under the same message key in English and in Korean", () => {
    const english = actionFeature(null, "Keyboard shortcuts") ?? "";
    expect(isMessageKey(english) && en[english]).toBe("Keyboard shortcuts");
    expect(actionFeature(null, "단축키")).toBe(english);
  });

  it("gives texts shared by several keys one id, in both languages", () => {
    expect(actionFeature(null, "Cancel")).toBe(actionFeature(null, "취소"));
  });

  it("prefers data-usage and ignores a trailing shortcut hint", () => {
    expect(actionFeature("settings", "설정 (⌘,)")).toBe("settings");
    expect(actionFeature(null, "Keyboard shortcuts (⌘/)")).toBe(actionFeature(null, "Keyboard shortcuts"));
  });

  it("records nothing for labels that carry content or are not UI text", () => {
    expect(actionFeature(null, "Delete “buy milk”")).toBeUndefined();
    expect(actionFeature(null, "fix-login")).toBeUndefined();
    expect(actionFeature(null, "   ")).toBeUndefined();
  });
});
