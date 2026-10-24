import { mkdir, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { Worktree } from "@/features/sessions/model/Agent";
import { GitError, repoRoot, runGit } from "@/platform/git";

/**
 * ### createWorktree
 *
 * Creates a new branch at `repo`'s current HEAD and checks it out in its own
 * directory under `worktreesDir`, so the agent's edits never touch the
 * user's checkout.
 *
 * @param slug - Short name used in the branch and directory names.
 * @returns The new worktree's location and base.
 * @throws {@link GitError} When `repo` is not a repository or git refuses.
 */
export async function createWorktree(repo: string, worktreesDir: string, slug: string): Promise<Worktree> {
  const root = await repoRoot(repo);
  if (root === undefined) throw new GitError(`${repo} is not a git repository`);
  const baseCommit = (await runGit(root, ["rev-parse", "HEAD"])).trim();
  const baseBranch = (await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  // A detached checkout has no branch to merge back into later.
  if (baseBranch === "HEAD") throw new GitError(`${root} is not on a branch (detached HEAD). Check out a branch and try again.`);
  const unique = `${slug}-${Date.now().toString(36)}`;
  const branch = `mothership/${unique}`;
  const dir = path.join(worktreesDir, unique);
  await mkdir(worktreesDir, { recursive: true });
  await runGit(root, ["worktree", "add", "-b", branch, dir, baseCommit]);
  return { repo: root, path: dir, branch, baseCommit, baseBranch, state: "active" };
}

/**
 * The worktree's own git folder in the main repository
 * (`<repo>/.git/worktrees/<name>`), found by the path git recorded for it.
 * The `.git` file inside the worktree is not trusted: the agent can rewrite
 * it to point at a folder with its own config (fsmonitor, filters, hooks).
 *
 * @throws {@link GitError} When git has no record of the worktree.
 */
async function adminDir(worktree: Worktree): Promise<string> {
  const common = path.resolve(/*turbopackIgnore: true*/ worktree.repo, (await runGit(worktree.repo, ["rev-parse", "--git-common-dir"])).trim());
  const worktrees = `${common}/worktrees`;
  // Git may record the path with symlinks resolved (e.g. /private/var for /var).
  const real = await realpath(/*turbopackIgnore: true*/ worktree.path).catch(() => worktree.path);
  const expected = new Set([`${worktree.path}/.git`, `${real}/.git`]);
  // Run-time paths, not files to bundle: keep the build tracer out of them.
  for (const name of await readdir(/*turbopackIgnore: true*/ worktrees).catch(() => [])) {
    const recorded = (await readFile(/*turbopackIgnore: true*/ `${worktrees}/${name}/gitdir`, "utf8").catch(() => "")).trim();
    // Compared as text: git records "<worktree>/.git" here.
    if (expected.has(recorded.replace(/\/+$/, ""))) return `${worktrees}/${name}`;
  }
  throw new GitError(`Git has no record of the worktree at ${worktree.path}`);
}

/** Runs git in the agent's worktree through its real git folder, never the worktree's own `.git` file. */
async function inWorktree(worktree: Worktree, args: Array<string>): Promise<string> {
  return runGit(worktree.path, ["--git-dir", await adminDir(worktree), "--work-tree", worktree.path, ...args]);
}

/**
 * ### worktreeDiff
 *
 * Everything the agent changed since the base commit: its commits, staged
 * and unstaged edits, and new files (marked intent-to-add so they appear).
 *
 * @returns Unified diff text, rename-aware.
 */
export async function worktreeDiff(worktree: Worktree): Promise<string> {
  await inWorktree(worktree, ["add", "--all", "--intent-to-add"]);
  return inWorktree(worktree, ["diff", "--no-color", "--no-ext-diff", "-M", worktree.baseCommit]);
}

/**
 * ### mergeWorktree
 *
 * Commits the agent's uncommitted work on its branch, then merges the branch
 * into `baseBranch` in the user's checkout with a merge commit. Refuses when
 * the checkout is on another branch or has uncommitted tracked changes, and
 * aborts cleanly on conflicts.
 *
 * @param message - Commit message for the agent's uncommitted work.
 * @returns The merge commit id.
 * @throws {@link GitError} On any refusal or git failure; the user's checkout is left as it was.
 */
export async function mergeWorktree(worktree: Worktree, message: string): Promise<string> {
  await inWorktree(worktree, ["add", "--all"]);
  const pending = (await inWorktree(worktree, ["status", "--porcelain"])).trim();
  if (pending !== "") await inWorktree(worktree, ["commit", "-m", message]);

  const current = (await runGit(worktree.repo, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (current !== worktree.baseBranch) {
    throw new GitError(`The original repository is on branch ${current}. Switch it to ${worktree.baseBranch} and merge again.`);
  }
  const dirty = (await runGit(worktree.repo, ["status", "--porcelain", "--untracked-files=no"])).trim();
  if (dirty !== "") throw new GitError("The original repository has uncommitted changes. Clean them up and merge again.");

  try {
    await runGit(worktree.repo, ["merge", "--no-ff", "--no-edit", worktree.branch]);
  } catch (error) {
    await runGit(worktree.repo, ["merge", "--abort"]).catch(() => {
      // Nothing to abort when the merge failed before starting.
    });
    throw error;
  }
  return (await runGit(worktree.repo, ["rev-parse", "HEAD"])).trim();
}

/**
 * ### removeWorktree
 *
 * Deletes the worktree directory and its branch. Either may already be gone.
 *
 * @param merged - The branch was merged, so delete it with git's safety check
 *   (`-d`); otherwise force-delete the unmerged work (`-D`).
 */
export async function removeWorktree(worktree: Worktree, merged: boolean): Promise<void> {
  // Forget worktrees whose folder is already gone (deleted by hand), so removing one is not an error.
  await runGit(worktree.repo, ["worktree", "prune"]);
  await runGit(worktree.repo, ["worktree", "remove", "--force", worktree.path]).catch((error: unknown) => {
    if (!/is not a working tree|No such file or directory/i.test(String(error instanceof Error ? error.message : error))) throw error;
  });
  await runGit(worktree.repo, ["branch", merged ? "-d" : "-D", worktree.branch]).catch((error: unknown) => {
    if (!/not found/i.test(String(error instanceof Error ? error.message : error))) throw error;
  });
}
