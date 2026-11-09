import { describe, expect, it } from "vitest";
import { dayInText } from "@/features/todos/ui/todoRow";
import { translator } from "@/ui/i18n/translate";

describe("dayInText", () => {
  const today = "2026-11-23";

  it("uses the in-sentence words for nearby days and keeps a date's own casing", () => {
    const t = translator("en");
    expect(dayInText("2026-11-24", today, t, "en-US")).toBe("tomorrow");
    expect(dayInText("2026-11-26", today, t, "en-US")).toBe("Thu, Nov 26");
  });
});
