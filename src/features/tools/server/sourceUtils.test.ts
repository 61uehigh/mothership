import { describe, expect, it } from "vitest";
import { highlightNames, linkMentions, mentionLink, zonedDate, zonedMidnight } from "@/features/tools/server/sourceUtils";

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

describe("zonedMidnight", () => {
  it("finds local midnight in a zone", () => {
    expect(new Date(zonedMidnight("2026-10-23", "Asia/Seoul")).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(new Date(zonedMidnight("2026-10-23", "America/Los_Angeles")).toISOString()).toBe("2026-10-23T07:00:00.000Z");
  });
});

describe("zonedDate", () => {
  it("puts an instant near midnight on the day of the given zone", () => {
    // 00:30 on Nov 4 in Seoul is still the afternoon of Nov 3 in Los Angeles.
    const halfPastMidnightSeoul = Date.parse("2026-11-03T15:30:00Z");
    expect(zonedDate(halfPastMidnightSeoul, "Asia/Seoul")).toBe("2026-11-04");
    expect(zonedDate(halfPastMidnightSeoul, "America/Los_Angeles")).toBe("2026-11-03");
    expect(zonedDate(Date.parse("2026-11-03T14:59:59Z"), "Asia/Seoul")).toBe("2026-11-03");
  });
});
