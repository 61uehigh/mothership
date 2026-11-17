import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeUrl, completeSignIn, memoTemplate, splitMemo } from "@/features/kakaotalk/server/kakaoApi";
import { missingPermission, permissionProblem } from "@/features/kakaotalk/server/kakaoDesktop";

describe("splitMemo", () => {
  it("keeps a short note whole and sends nothing for an empty one", () => {
    expect(splitMemo("  장보기: 우유, 계란  ")).toEqual(["장보기: 우유, 계란"]);
    expect(splitMemo("   ")).toEqual([]);
  });

  it("cuts a long note at line breaks or spaces, within the limit", () => {
    const note = `${"a".repeat(8)}\n${"b".repeat(8)} ${"c".repeat(8)}`;
    const parts = splitMemo(note, 12);
    expect(parts).toEqual(["a".repeat(8), "b".repeat(8), "c".repeat(8)]);
  });

  it("cuts mid-word when there is no break point, and counts emoji as one character", () => {
    expect(splitMemo("😀".repeat(5), 2)).toEqual(["😀😀", "😀😀", "😀"]);
  });
});

describe("memoTemplate", () => {
  it("links the note's first web address", () => {
    expect(JSON.parse(memoTemplate("part", "see https://example.com/a?b=1 and https://other.com"))).toEqual({
      object_type: "text",
      text: "part",
      link: { web_url: "https://example.com/a?b=1", mobile_web_url: "https://example.com/a?b=1" },
      button_title: "Open link",
    });
  });
});

describe("authorizeUrl", () => {
  const saved = process.env.KAKAO_REST_API_KEY;
  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = "test-key";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = saved;
  });

  it("asks only for talk_message, with this server's callback and a state", () => {
    const url = new URL(authorizeUrl("http://localhost:3000/api/kakaotalk/auth/callback"));
    expect(url.origin + url.pathname).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-key");
    expect(url.searchParams.get("scope")).toBe("talk_message");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/kakaotalk/auth/callback");
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a callback whose state it did not start, before calling Kakao", async () => {
    await expect(completeSignIn("code", "unknown-state")).rejects.toMatchObject({ status: 400, code: "bad-state" });
  });

  it("refuses a state that expired", async () => {
    const start = Date.now();
    const state = new URL(authorizeUrl("http://localhost:3000/cb", start)).searchParams.get("state") ?? "";
    await expect(completeSignIn("code", state, start + 11 * 60_000)).rejects.toMatchObject({ code: "bad-state" });
  });
});

describe("permissionProblem", () => {
  it("names the macOS permission that blocked the script, and leaves other failures alone", () => {
    expect(permissionProblem("execution error: Error: osascript is not allowed assistive access. (-25211)")).toMatch(/Accessibility/);
    expect(permissionProblem("Not authorized to send Apple events to System Events. (-1743)")).toMatch(/Automation/);
    expect(permissionProblem("syntax error")).toBeUndefined();
  });

  it("tells which permission was refused, so Settings can mark the other one granted", () => {
    expect(missingPermission("execution error: Error: osascript is not allowed assistive access. (-25211)")).toBe("accessibility");
    expect(missingPermission("Not authorized to send Apple events to System Events. (-1743)")).toBe("automation");
    expect(missingPermission("syntax error")).toBeUndefined();
  });
});
