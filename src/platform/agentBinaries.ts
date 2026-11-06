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
      const binary = path.join(realpathSync(sdk), "..", `claude-agent-sdk-${process.platform}-${process.arch}`, process.platform === "win32" ? "claude.exe" : "claude");
      return existsSync(binary) ? binary : undefined;
    },
    "claude",
  );
}

/** The Rust target each platform package of `@openai/codex` keeps its binary under. */
const CODEX_TARGETS: Record<string, string> = {
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
};

/**
 * ### codexBinaryCandidates
 *
 * Where the native Codex binary may sit, given the real folder of the
 * `@openai/codex` package: pnpm links its platform package beside it as
 * `codex-<platform>-<arch>`, which keeps the binary under `vendor/<target>/`
 * (in `bin/` now, in `codex/` in older releases). The same lookup the Codex
 * SDK makes.
 *
 * @param join - `path.join` of the platform the paths are for.
 * @returns The paths to try in order; none for a platform Codex does not ship.
 */
export function codexBinaryCandidates(codexPackage: string, platform: string, arch: string, join: (...parts: Array<string>) => string): Array<string> {
  const target = CODEX_TARGETS[`${platform}-${arch}`];
  if (target === undefined) return [];
  const vendor = join(codexPackage, "..", `codex-${platform}-${arch}`, "vendor", target);
  const name = platform === "win32" ? "codex.exe" : "codex";
  return [join(vendor, "bin", name), join(vendor, "codex", name)];
}

/**
 * ### codexCommand
 *
 * On Windows, the native `codex.exe`: the shim in `node_modules/.bin` there
 * is a shell script (beside a `.cmd`), which neither `cmd` nor `spawn` can
 * run as a program. Elsewhere the shim, which also puts Codex's helper
 * tools on `PATH`.
 *
 * @returns The Codex binary to run directly (e.g. to log in).
 */
export function codexCommand(): string {
  return locate(
    "MOTHERSHIP_CODEX_PATH",
    () => {
      if (process.platform !== "win32") {
        const bin = appPath("node_modules", ".bin", "codex");
        return existsSync(bin) ? bin : undefined;
      }
      const codexPackage = appPath("node_modules", "@openai", "codex");
      if (!existsSync(codexPackage)) return undefined;
      return codexBinaryCandidates(realpathSync(codexPackage), process.platform, process.arch, path.join).find((binary) => existsSync(binary));
    },
    "codex",
  );
}
