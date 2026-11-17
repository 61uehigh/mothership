import { describe, expect, it } from "vitest";
import { dialogLanguage, dialogText } from "./dialogText.mjs";

describe("dialogLanguage", () => {
  it("follows the language chosen in the app over the system's", () => {
    expect(dialogLanguage("ko", "en-US")).toBe("ko");
    expect(dialogLanguage("en", "ko-KR")).toBe("en");
  });

  it("falls back to the system's language when the page could not say, and to English for others", () => {
    expect(dialogLanguage(undefined, "ko-KR")).toBe("ko");
    expect(dialogLanguage(null, "ko")).toBe("ko");
    expect(dialogLanguage("fr", "de-DE")).toBe("en");
  });
});

describe("dialogText", () => {
  it("offers the same messages, with the same values, in both languages", () => {
    const shape = (language) => Object.entries(dialogText(language)).map(([key, value]) => [key, typeof value === "function" ? value.length : "text"]);
    expect(shape("ko")).toEqual(shape("en"));
  });
});
