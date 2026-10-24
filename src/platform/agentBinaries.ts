import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { appPath } from "@/platform/paths";

/**
 * ### claudeExecutable
 *
 * The Claude Code binary the Agent SDK runs. A packaged app ships its own and
 * sets `MOTHERSHIP_CLAUDE_PATH`; in development the SDK finds the one in
 * `node_modules`.
 *
 * @returns SDK options that point at it, or none to let the SDK look it up.
 */
export function claudeExecutable(): { pathToClaudeCodeExecutable?: string } {
  const path = process.env.MOTHERSHIP_CLAUDE_PATH;
  return path ? { pathToClaudeCodeExecutable: path } : {};
}

/**
 * ### codexExecutable
 *
 * Like {@link claudeExecutable}, for the Codex binary (`MOTHERSHIP_CODEX_PATH`).
 */
export function codexExecutable(): { codexPathOverride?: string } {
  const path = process.env.MOTHERSHIP_CODEX_PATH;
  return path ? { codexPathOverride: path } : {};
}

/** A bundled binary, else the one in this project's node_modules, else whatever is on PATH. */
function locate(env: string, fromNodeModules: () => string | undefined, name: string): string {
  return process.env[env] || fromNodeModules() || name;
}

/**
 * ### claudeCommand
 *
 * @returns The Claude Code binary to run directly (e.g. to log in).
 */
export function claudeCommand(): string {
  return locate(
    "MOTHERSHIP_CLAUDE_PATH",
    () => {
      // pnpm links a package's dependencies beside it, so the platform binary sits next to the SDK.
      const sdk = appPath("node_modules", "@anthropic-ai", "claude-agent-sdk");
      if (!existsSync(sdk)) return undefined;
      const binary = path.join(realpathSync(sdk), "..", `claude-agent-sdk-darwin-${process.arch}`, "claude");
      return existsSync(binary) ? binary : undefined;
    },
    "claude",
  );
}

/**
 * ### codexCommand
 *
 * @returns The Codex binary to run directly (e.g. to log in).
 */
export function codexCommand(): string {
  return locate(
    "MOTHERSHIP_CODEX_PATH",
    () => {
      const bin = appPath("node_modules", ".bin", "codex");
      return existsSync(bin) ? bin : undefined;
    },
    "codex",
  );
}
