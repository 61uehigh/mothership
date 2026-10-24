import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LocalRepo } from "@/features/github/model/GitHub";
import { loadRepositories } from "@/features/github/server/repositories";

const run = promisify(execFile);

const REMOTE_PATTERN = /github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/**
 * ### parseGitHubRemote
 *
 * @param url - A git remote URL (HTTPS, SSH, or scp-like).
 * @returns `owner/name` for github.com remotes, otherwise `undefined`.
 */
function parseGitHubRemote(url: string): string | undefined {
  const match = REMOTE_PATTERN.exec(url.trim());
  return match === null ? undefined : `${match[1]}/${match[2]}`;
}

async function originOf(dir: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["remote", "get-url", "origin"], { cwd: dir, timeout: 10_000 });
    return parseGitHubRemote(stdout);
  } catch {
    // Not a repository, no origin, or the directory is gone: just skip it.
    return undefined;
  }
}

/**
 * ### listLocalRepos
 *
 * GitHub repositories behind the folders you listed and the given folders
 * (such as sessions' repositories and the default folder), deduplicated (the
 * first folder found wins).
 *
 * @param extraDirs - More folders to check after the ones you listed.
 */
export async function listLocalRepos(extraDirs: Array<string> = []): Promise<Array<LocalRepo>> {
  // Repositories you listed come first.
  const dirs = [...new Set([...(await loadRepositories()), ...extraDirs])];
  const origins = await Promise.all(dirs.map(originOf));
  const repos = new Map<string, LocalRepo>();
  dirs.forEach((dir, i) => {
    const repo = origins[i];
    if (repo !== undefined && !repos.has(repo)) repos.set(repo, { repo, dir, source: "local" });
  });
  return [...repos.values()];
}
