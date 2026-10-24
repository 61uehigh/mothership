import { describe, expect, it } from "vitest";
import { highlightNames, linkMentions, mentionLink, tsToEpoch, zonedMidnight } from "@/features/tools/server/sourceUtils";

describe("linkMentions", () => {
  it("links handles outside code, yours as me", () => {
    expect(linkMentions("cc @kim and @me, `@code` stays", "me")).toBe("cc [@kim](mention:other) and [@me](mention:me), `@code` stays");
  });

  it("leaves email addresses alone", () => {
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

describe("tsToEpoch", () => {
  it("reads Slack timestamps as epoch milliseconds", () => {
    expect(tsToEpoch("1792659089.594709")).toBe(1792659089595);
    expect(tsToEpoch("nope")).toBeUndefined();
  });
});

describe("zonedMidnight", () => {
  it("finds local midnight in a zone", () => {
    expect(new Date(zonedMidnight("2026-10-23", "Asia/Seoul")).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(new Date(zonedMidnight("2026-10-23", "America/Los_Angeles")).toISOString()).toBe("2026-10-23T07:00:00.000Z");
  });
});
