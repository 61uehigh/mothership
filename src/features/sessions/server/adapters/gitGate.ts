/**
 * Git subcommands a session with "Allow git" may run. `config` is left out
 * (it could set aliases, hooks, or ssh commands that run arbitrary programs),
 * as is `worktree` (mothership manages worktrees itself), and anything not listed.
 */
const ALLOWED = new Set([
  "status", "log", "diff", "show", "add", "rm", "mv", "commit", "reset", "restore", "checkout", "switch", "branch",
  "merge", "rebase", "cherry-pick", "revert", "stash", "tag", "fetch", "pull", "push", "remote", "rev-parse",
  "rev-list", "ls-files", "blame", "reflog", "shortlog", "describe", "grep", "clean", "notes",
]);

/**
 * Options that run another program or write outside the repository, by
 * subcommand (`*` for every subcommand). Git accepts any unambiguous prefix of
 * a long option, so a prefix of one of these is refused too.
 */
const DANGEROUS_LONG: Record<string, Array<string>> = {
  "*": ["--output", "--ext-diff", "--textconv", "--exec", "--upload-pack", "--receive-pack", "--open-files-in-pager"],
};
/** Short options with the same effect: `rebase -x`, `grep -O`, `fetch`/`pull -u`. */
const DANGEROUS_SHORT: Record<string, string> = { rebase: "x", grep: "O", fetch: "u", pull: "u" };

/**
 * Settings forced on every gated command: no hooks or fsmonitor program
 * (nothing in the repository's config or .git folder runs), and no `ext::`
 * transport (which runs a command as the "remote").
 */
const SAFE_CONFIG = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never"];

/**
 * ### GitCommand
 *
 * A command the git gate let through, rewritten to run safely.
 */
export type GitCommand = {
  /** The command to run instead: every word quoted, hooks and helper programs disabled. */
  command: string;
  /** The command as you'd read it, for an approval question. */
  display: string;
  subcommand: string;
  /** Pushes need the human's approval first. */
  needsApproval: boolean;
};

/**
 * Splits a command line into words the way a POSIX shell would, but accepts
 * only what can be read without running anything: plain words, '…', and "…"
 * without `$`, backquotes, or backslashes. Anything the shell would expand
 * or treat specially (`$`, globs, `~`, braces, redirects, `;`) is refused,
 * so the words checked here are exactly the arguments git receives.
 *
 * @returns The words, or a reason the line is refused.
 */
function splitWords(line: string): Array<string> | { refused: string } {
  const words: Array<string> = [];
  let word: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === " " || c === "\t") {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) return { refused: "an unclosed quote" };
      word = (word ?? "") + line.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      const end = line.indexOf('"', i + 1);
      if (end === -1) return { refused: "an unclosed quote" };
      const inner = line.slice(i + 1, end);
      if (/[$`\\]/.test(inner)) return { refused: "$, backquotes, or backslashes inside double quotes" };
      word = (word ?? "") + inner;
      i = end;
    } else if (/[;&|`<>$\\*?[\]{}!#()\n\r]/.test(c) || (c === "~" && word === undefined)) {
      // `~` expands only at the start of a word; `HEAD~1` is literal.
      return { refused: "shell syntax (;, &&, |, redirects, $, globs, or escapes); use one plain git command and quote arguments" };
    } else {
      word = (word ?? "") + c;
    }
  }
  if (word !== undefined) words.push(word);
  return words;
}

/** Quotes a word for a POSIX shell so it reaches git exactly as written. */
function quote(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/** Why `word` is a dangerous option for `subcommand`, if it is one. */
function dangerousOption(subcommand: string, word: string): string | undefined {
  if (word.startsWith("--")) {
    const name = word.split("=")[0];
    // `--o` could abbreviate `--output`; git resolves unambiguous prefixes, so refuse those too.
    const hit = [...(DANGEROUS_LONG["*"] ?? []), ...(DANGEROUS_LONG[subcommand] ?? [])].find((option) => name.length > 2 && option.startsWith(name));
    return hit;
  }
  const short = DANGEROUS_SHORT[subcommand];
  // A cluster such as `-ix` holds several short options.
  if (short !== undefined && /^-[A-Za-z]+/.test(word) && word.slice(1).split(/[^A-Za-z]/)[0].includes(short)) return `-${short}`;
  return undefined;
}

/**
 * ### parseGitCommand
 *
 * Accepts one plain `git <subcommand> …` invocation: no shell syntax at all,
 * no options before the subcommand (`-C`, `-c`, `--git-dir` could leave the
 * session's folder or run programs), an allowed subcommand, and none of the
 * options that run programs or write outside the repository.
 *
 * @returns The rewritten command, or a reason it is refused.
 */
export function parseGitCommand(raw: string): GitCommand | { refused: string } {
  const words = splitWords(raw.trim());
  if ("refused" in words) return { refused: `not allowed: ${words.refused}` };
  if (words[0] !== "git") return { refused: "not a git command" };
  const subcommand = words[1] ?? "";
  if (subcommand.startsWith("-")) return { refused: "options before the git subcommand (-C, -c, --git-dir, …) are not allowed" };
  if (!ALLOWED.has(subcommand)) return { refused: `git ${subcommand || "(nothing)"} is not allowed here` };
  const args = words.slice(2);
  // After `--`, words are paths, not options.
  const end = args.indexOf("--");
  for (const word of end === -1 ? args : args.slice(0, end)) {
    const option = dangerousOption(subcommand, word);
    if (option !== undefined) {
      const shown = word === option || word.startsWith(`${option}=`) ? option : `${word} (${option})`;
      return { refused: `${shown} can run programs or write outside the repository` };
    }
  }
  const display = ["git", subcommand, ...args].map(quote).join(" ");
  return {
    command: ["git", ...SAFE_CONFIG, subcommand, ...args].map(quote).join(" "),
    display,
    subcommand,
    needsApproval: subcommand === "push",
  };
}

/**
 * ### touchesGitDir
 *
 * Whether a file path is inside a `.git` folder, or is a worktree's `.git`
 * file. Sessions must not edit either: their config and hooks decide what git
 * commands run. Pass the real path (symlinks resolved) as well, so a link
 * into `.git` is caught.
 */
export function touchesGitDir(filePath: string): boolean {
  return /(^|[\\/])\.git([\\/]|$)/.test(filePath);
}
