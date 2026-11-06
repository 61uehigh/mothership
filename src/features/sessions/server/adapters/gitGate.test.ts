import { describe, expect, it } from "vitest";
import { parseGitCommand, touchesGitDir } from "@/features/sessions/server/adapters/gitGate";

const SAFE = "git -c core.hooksPath=/dev/null -c core.fsmonitor=false -c protocol.ext.allow=never";

describe("parseGitCommand", () => {
  it("lets plain git commands through, quoted, with hooks and helper programs off", () => {
    expect(parseGitCommand('git commit -m "fix: tidy"')).toEqual({
      command: `${SAFE} commit -m 'fix: tidy'`,
      display: "git commit -m 'fix: tidy'",
      subcommand: "commit",
      needsApproval: false,
    });
  });

  it("asks before any push", () => {
    expect(parseGitCommand("git push --force-with-lease origin main")).toMatchObject({ subcommand: "push", needsApproval: true });
  });

  it("keeps a single-quoted message with shell characters literal", () => {
    expect(parseGitCommand("git commit -m 'a; b | c $(d)'")).toMatchObject({ command: `${SAFE} commit -m 'a; b | c $(d)'` });
  });

  it("keeps ~ inside a word literal but refuses a leading ~", () => {
    expect(parseGitCommand("git diff HEAD~1")).toMatchObject({ command: `${SAFE} diff 'HEAD~1'` });
    expect("refused" in parseGitCommand("git add ~/secrets")).toBe(true);
  });

  it("allows options that only look like dangerous ones", () => {
    expect(parseGitCommand("git diff --output-indicator-new=+")).toMatchObject({ subcommand: "diff" });
    expect(parseGitCommand("git log -- --output")).toMatchObject({ subcommand: "log" });
  });

  it.each([
    ["ls -la", "not a git command"],
    ["git status && rm -rf .", "shell syntax"],
    ["git log | head", "shell syntax"],
    ["git log $(whoami)", "shell syntax"],
    ["git log $HOME", "shell syntax"],
    ["git rebase --e*", "shell syntax"],
    ['git commit -m "$(id)"', "inside double quotes"],
    ["git -C /tmp status", "options before"],
    ["git -c core.pager=sh log", "options before"],
    ["git config alias.x '!sh'", "is not allowed"],
    ["git worktree add /tmp/x", "is not allowed"],
    ["git rebase -x 'sh evil.sh' HEAD~1", "can run programs"],
    ["git rebase -ix true HEAD~1", "can run programs"],
    ["git rebase --exec=true HEAD~1", "can run programs"],
    ["git rebase --exe true HEAD~1", "can run programs"],
    ["git grep -O sh -l x", "can run programs"],
    ["git grep --open-files-in-pager=sh x", "can run programs"],
    ["git fetch --upload-pack='sh evil.sh' .", "can run programs"],
    ["git pull -u 'sh evil.sh' .", "can run programs"],
    ["git push --receive-pack=evil origin", "can run programs"],
    ["git log -1 --output=/repo/.git/config", "can run programs"],
    ["git diff --ext-diff", "can run programs"],
  ])("refuses %s", (command, reason) => {
    const result = parseGitCommand(command);
    expect("refused" in result && result.refused).toContain(reason);
  });
});

describe("touchesGitDir", () => {
  it("spots paths inside .git", () => {
    expect(touchesGitDir("/repo/.git/hooks/pre-commit")).toBe(true);
    expect(touchesGitDir("/repo/.git")).toBe(true);
    expect(touchesGitDir("/repo/.github/workflows/ci.yml")).toBe(false);
    expect(touchesGitDir("/repo/src/git.ts")).toBe(false);
  });
});
