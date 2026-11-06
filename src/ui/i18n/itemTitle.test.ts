import { describe, expect, it } from "vitest";
import { itemPathTitle } from "@/ui/i18n/itemTitle";
import { translator } from "@/ui/i18n/translate";

describe("itemPathTitle", () => {
  it("words each empty part in the language of the moment and keeps the others as they are", () => {
    expect(itemPathTitle(translator("en"), " / Weekly")).toBe("(untitled) / Weekly");
    expect(itemPathTitle(translator("ko"), "Meetings /  / Weekly")).toBe("Meetings / (제목 없음) / Weekly");
    expect(itemPathTitle(translator("en"), "")).toBe("(untitled)");
  });
});
