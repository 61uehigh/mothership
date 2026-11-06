import { describe, expect, it } from "vitest";
import { homeRelativePath } from "@/features/explorer/model/homeRelativePath";

describe("homeRelativePath", () => {
  it("reads a macOS path under home", () => {
    expect(homeRelativePath("/Users/me/code/app", "/Users/me")).toBe("code/app");
  });

  it("reads a Windows path under home, with forward slashes in the answer", () => {
    expect(homeRelativePath("C:\\Users\\me\\code\\app", "C:\\Users\\me")).toBe("code/app");
  });

  it("answers home itself as the empty path", () => {
    expect(homeRelativePath("C:\\Users\\me", "C:\\Users\\me\\")).toBe("");
  });

  it("leaves out a folder outside home, even one whose name starts like it", () => {
    expect(homeRelativePath("/Users/meg/code", "/Users/me")).toBeUndefined();
    expect(homeRelativePath("D:\\code", "C:\\Users\\me")).toBeUndefined();
  });
});
