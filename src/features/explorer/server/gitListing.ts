import { readdir } from "node:fs/promises";
import path from "node:path";
import { runGit } from "@/platform/git";

/** Listing output for big repositories easily exceeds the usual cap. */
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".next", ".mothership"]);

/**
 * ### MAX_FILES
 *
 * The most files a listing returns.
 */
export const MAX_FILES = 20_000;

const git = (cwd: string, args: Array<string>) => runGit(cwd, args, { maxBytes: MAX_GIT_OUTPUT_BYTES });

/**
 * ### gitFiles
 *
 * @returns Tracked and untracked-but-not-ignored files under `dir`, relative to it.
 */
export async function gitFiles(dir: string): Promise<Array<string>> {
  return (await git(dir, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])).split("\0");
}

/**
 * ### walk
 *
 * A bounded walk for folders outside git, skipping dependency and build folders.
 *
 * @returns Up to {@link MAX_FILES} files, relative to `root`, sorted.
 */
export async function walk(root: string): Promise<Array<string>> {
  const files: Array<string> = [];
  const queue: Array<string> = [""];
  while (queue.length > 0 && files.length < MAX_FILES) {
    const relative = queue.shift() ?? "";
    let entries;
    try {
      entries = await readdir(path.join(root, relative), { withFileTypes: true });
    } catch {
      // Unreadable folder (permissions, removed mid-walk): skip it.
      continue;
    }
    for (const entry of entries) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) queue.push(child);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(child);
        if (files.length >= MAX_FILES) break;
      }
    }
  }
  return files.sort();
}

/** Reduces a porcelain `XY` pair to one code: `??` for untracked, else the index or work tree letter. */
function statusCode(xy: string): string {
  if (xy === "??") return "??";
  const [index, tree] = [xy[0], xy[1]];
  if (index === "D" || tree === "D") return "D";
  return index !== " " ? index : tree;
}

/**
 * ### gitStatus
 *
 * @param only - Limits the status to one path.
 * @returns A one-letter status (`??` for untracked) by path relative to `dir`.
 */
export async function gitStatus(dir: string, only?: string): Promise<Record<string, string>> {
  // Porcelain paths are relative to the repository top level; strip the prefix to make them relative to `dir`.
  const prefix = (await git(dir, ["rev-parse", "--show-prefix"])).trim();
  const out = await git(dir, ["status", "--porcelain", "-z", "--untracked-files=all", "--", only ?? "."]);
  const status: Record<string, string> = {};
  const records = out.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.length < 4) continue;
    const xy = record.slice(0, 2);
    const file = record.slice(3);
    // Renames and copies are followed by a record holding the original path.
    if (xy[0] === "R" || xy[0] === "C") i++;
    if (!file.startsWith(prefix)) continue;
    status[file.slice(prefix.length)] = statusCode(xy);
  }
  return status;
}
