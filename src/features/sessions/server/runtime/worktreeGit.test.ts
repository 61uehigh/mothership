import { describe, expect, it } from "vitest";
import { isRecordedWorktree } from "@/features/sessions/server/runtime/worktreeGit";

describe("isRecordedWorktree", () => {
  it("matches the path Git for Windows records with forward slashes", () => {
    expect(isRecordedWorktree("C:/Users/me/data/.mothership/worktrees/fix-1/.git\n", ["C:\\Users\\me\\data\\.mothership\\worktrees\\fix-1"], "win32")).toBe(true);
  });

  it("ignores case on Windows and macOS, but not on Linux", () => {
    expect(isRecordedWorktree("c:/users/ME/wt/.git", ["C:\\Users\\me\\wt"], "win32")).toBe(true);
    expect(isRecordedWorktree("/Users/Me/wt/.git", ["/Users/me/wt"], "darwin")).toBe(true);
    expect(isRecordedWorktree("/home/Me/wt/.git", ["/home/me/wt"], "linux")).toBe(false);
  });

  it("matches the real path of a folder reached through a symlink, and a trailing slash", () => {
    expect(isRecordedWorktree("/private/var/wt/.git/", ["/var/wt", "/private/var/wt"], "darwin")).toBe(true);
  });

  it("refuses another worktree and an empty record", () => {
    expect(isRecordedWorktree("/repo/wt-2/.git", ["/repo/wt"], "darwin")).toBe(false);
    expect(isRecordedWorktree("/repo/wt/.git", ["/repo/wt/.git"], "darwin")).toBe(false);
    expect(isRecordedWorktree("  ", ["/repo/wt"], "darwin")).toBe(false);
  });
});
