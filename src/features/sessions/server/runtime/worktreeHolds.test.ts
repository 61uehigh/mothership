import { describe, expect, it } from "vitest";
import type { Worktree } from "@/features/sessions/model/Agent";
import { isHeldByWorktreeOperation } from "@/features/sessions/server/runtime/worktreeHolds";

const worktree = { path: "/wt/fix", state: "active" } as Worktree;
const merging = [{ agentId: "lead", folder: "/wt/fix" }];

describe("isHeldByWorktreeOperation", () => {
  it("holds the agent being merged", () => {
    expect(isHeldByWorktreeOperation({ id: "lead", workingDirectory: "/wt/fix", worktree }, merging, "/")).toBe(true);
  });

  it("holds a sub-agent working in the worktree or a folder below it", () => {
    expect(isHeldByWorktreeOperation({ id: "sub", workingDirectory: "/wt/fix", worktree: undefined }, merging, "/")).toBe(true);
    expect(isHeldByWorktreeOperation({ id: "sub", workingDirectory: "/wt/fix/packages/app", worktree: undefined }, merging, "/")).toBe(true);
  });

  it("does not hold an agent in a sibling folder that shares the name's prefix", () => {
    expect(isHeldByWorktreeOperation({ id: "other", workingDirectory: "/wt/fix-2", worktree: undefined }, merging, "/")).toBe(false);
  });

  it("does not hold another agent's own worktree nested in the folder", () => {
    expect(isHeldByWorktreeOperation({ id: "other", workingDirectory: "/wt/fix/nested", worktree: { ...worktree, path: "/wt/fix/nested" } }, merging, "/")).toBe(false);
  });

  it("holds only the session itself when it is deleted without a worktree", () => {
    const deleting = [{ agentId: "plain", folder: undefined }];
    expect(isHeldByWorktreeOperation({ id: "plain", workingDirectory: "/repo", worktree: undefined }, deleting, "/")).toBe(true);
    expect(isHeldByWorktreeOperation({ id: "neighbor", workingDirectory: "/repo", worktree: undefined }, deleting, "/")).toBe(false);
  });

  it("matches Windows paths with backslashes", () => {
    const holds = [{ agentId: "lead", folder: "C:\\wt\\fix" }];
    expect(isHeldByWorktreeOperation({ id: "sub", workingDirectory: "C:\\wt\\fix\\src", worktree: undefined }, holds, "\\")).toBe(true);
  });
});
