import { describe, expect, it } from "vitest";
import { highlightNames, linkMentions, mentionLink } from "@/features/tools/server/sourceUtils";

describe("linkMentions", () => {
  it("links handles outside code and email addresses, yours as me", () => {
    expect(linkMentions("cc @kim and @me, `@code` stays", "me")).toBe("cc [@kim](mention:other) and [@me](mention:me), `@code` stays");
    expect(linkMentions("mail kim@example.com", undefined)).toBe("mail kim@example.com");
  });
});

describe("highlightNames", () => {
  it("marks your names but not inside links or code", () => {
    const out = highlightNames("작성자: 이지은, 김민수 [김민수](https://x.example) `김민수`", ["김민수"]);
    expect(out).toBe("작성자: 이지은, [김민수](mention:me) [김민수](https://x.example) `김민수`");
  });

  it("prefers the longer name", () => {
    expect(highlightNames("Jane Doe", ["Jane", "Jane Doe"])).toBe(mentionLink("Jane Doe", true, false));
  });
});
