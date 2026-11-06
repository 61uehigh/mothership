import path from "node:path";
import { describe, expect, it } from "vitest";
import { codexBinaryCandidates } from "@/platform/agentBinaries";

describe("codexBinaryCandidates", () => {
  it("finds codex.exe in the Windows platform package beside @openai/codex", () => {
    const codexPackage = String.raw`C:\app\node_modules\.pnpm\@openai+codex@1.0.0\node_modules\@openai\codex`;
    expect(codexBinaryCandidates(codexPackage, "win32", "x64", path.win32.join)).toEqual([
      String.raw`C:\app\node_modules\.pnpm\@openai+codex@1.0.0\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`,
      String.raw`C:\app\node_modules\.pnpm\@openai+codex@1.0.0\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\codex\codex.exe`,
    ]);
  });

  it("names the binary without .exe on macOS", () => {
    expect(codexBinaryCandidates("/app/node_modules/.pnpm/x/node_modules/@openai/codex", "darwin", "arm64", path.posix.join)[0]).toBe(
      "/app/node_modules/.pnpm/x/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex",
    );
  });

  it("finds the binary in this checkout's own platform package", async () => {
    const { existsSync, realpathSync } = await import("node:fs");
    const codexPackage = path.join(process.cwd(), "node_modules", "@openai", "codex");
    if (!existsSync(codexPackage)) return;
    expect(codexBinaryCandidates(realpathSync(codexPackage), process.platform, process.arch, path.join).some((binary) => existsSync(binary))).toBe(true);
  });

  it("has nothing for a platform Codex does not ship", () => {
    expect(codexBinaryCandidates("/app/codex", "freebsd", "x64", path.posix.join)).toEqual([]);
  });
});
