import { describe, expect, it } from "vitest";
import { baseName, fileLink, keepFileHref, relativeInside } from "@/lib/filePaths";

describe("fileLink", () => {
  it("reads absolute POSIX and file:// links with their line", () => {
    expect(fileLink("/Users/me/app/src/a.ts:44")).toEqual({ path: "/Users/me/app/src/a.ts", line: 44, relative: false });
    expect(fileLink("file:///Users/me/a%20b.ts#L7")).toEqual({ path: "/Users/me/a b.ts", line: 7, relative: false });
  });

  it("reads Windows drive paths, with either separator and as file:// URLs", () => {
    expect(fileLink("C:\\x\\a.ts:12")).toEqual({ path: "C:\\x\\a.ts", line: 12, relative: false });
    expect(fileLink("C:/x/a.ts")).toEqual({ path: "C:/x/a.ts", line: undefined, relative: false });
    expect(fileLink("file:///C:/x/a.ts#L3")).toEqual({ path: "C:/x/a.ts", line: 3, relative: false });
  });

  it("reads relative links, which agents use for files in their folder", () => {
    expect(fileLink("src/a.ts:44")).toEqual({ path: "src/a.ts", line: 44, relative: true });
    expect(fileLink("./src/a.ts#L44")).toEqual({ path: "src/a.ts", line: 44, relative: true });
    expect(fileLink("a.ts:12:3")).toEqual({ path: "a.ts", line: 12, relative: true });
    expect(fileLink("src\\a.ts")).toEqual({ path: "src\\a.ts", line: undefined, relative: true });
  });

  it("leaves web links, anchors, queries and undecodable hrefs alone", () => {
    for (const href of ["https://example.com/a.ts", "mailto:me@example.com", "//cdn.example.com/x", "#section", "?q=1", "", "/bad%E0%A4%A"]) {
      expect(fileLink(href)).toBeUndefined();
    }
  });
});

describe("keepFileHref", () => {
  it("keeps file hrefs a URL sanitizer reads as unknown schemes, and nothing else", () => {
    expect(keepFileHref("C:\\x\\a.ts")).toBe(true);
    expect(keepFileHref("a.ts:12")).toBe(true);
    expect(keepFileHref("javascript:alert(1)")).toBe(false);
    expect(keepFileHref("javascript:1")).toBe(false);
    expect(keepFileHref("javascript:1#x")).toBe(false);
    expect(keepFileHref("data:text/html,x")).toBe(false);
    expect(keepFileHref("vbscript:1")).toBe(false);
  });
});

describe("relativeInside", () => {
  it("gives the rest of a path inside the folder, with either separator", () => {
    expect(relativeInside("/Users/me/app", "/Users/me/app/src/a.ts")).toBe("src/a.ts");
    expect(relativeInside("/Users/me/app/", "/Users/me/app/src/a.ts")).toBe("src/a.ts");
    expect(relativeInside("C:\\Users\\me\\app", "C:\\Users\\me\\app\\src\\a.ts")).toBe("src\\a.ts");
    expect(relativeInside("C:\\Users\\me\\app", "C:/Users/me/app/src/a.ts")).toBe("src/a.ts");
  });

  it("compares Windows paths without case, POSIX paths with it", () => {
    expect(relativeInside("C:\\Users\\Me\\App", "c:\\users\\me\\app\\a.ts")).toBe("a.ts");
    expect(relativeInside("/Users/Me/app", "/Users/me/app/a.ts")).toBeUndefined();
  });

  it("gives an empty path for the folder itself and nothing for a path outside it", () => {
    expect(relativeInside("C:\\Users\\me", "C:\\Users\\me\\")).toBe("");
    expect(relativeInside("/Users/me/app", "/Users/me/app2/a.ts")).toBeUndefined();
    expect(relativeInside("/Users/me/app", "/etc/hosts")).toBeUndefined();
  });
});

describe("baseName", () => {
  it("takes the last segment of POSIX and Windows paths", () => {
    expect(baseName("/Users/me/mothership")).toBe("mothership");
    expect(baseName("C:\\Users\\me\\mothership\\")).toBe("mothership");
    expect(baseName("/")).toBe("/");
  });
});
