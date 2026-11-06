import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportableSession } from "@/features/sessions/model/Import";
import type { ImportSteps } from "@/features/sessions/server/import/sessionImport";

let home: string;
const realHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "mothership-import-"));
  // os.homedir() reads HOME on macOS and Linux, USERPROFILE on Windows.
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});

afterEach(() => {
  for (const [key, value] of Object.entries(realHome)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(home, { recursive: true, force: true });
});

function rollout(name: string, lines: Array<unknown>): void {
  const dir = path.join(home, ".codex", "sessions", "2026", "11", "25");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), lines.map((line) => JSON.stringify(line)).join("\n"));
}

describe("listImportable codex", () => {
  it("skips a rollout that vanished after it was listed, and still lists the rest", async () => {
    rollout("rollout-a.jsonl", [
      { type: "session_meta", payload: { id: "thread-a", cwd: "/repo", originator: "codex_cli_rs", git: { branch: "main" } } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>x</environment_context>" }] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Fix the login bug\nplease" }] } },
    ]);
    // Listed by readdir, but stat fails: as if Codex deleted it in between.
    symlinkSync(path.join(home, "missing.jsonl"), path.join(home, ".codex", "sessions", "2026", "11", "25", "rollout-gone.jsonl"));
    const { listImportable } = await import("@/features/sessions/server/import/sessionImport");
    const sessions = await listImportable("codex");
    expect(sessions).toEqual([expect.objectContaining({ provider: "codex", id: "thread-a", title: "Fix the login bug", cwd: "/repo", branch: "main" })]);
  });

  it("leaves out headless SDK runs", async () => {
    rollout("rollout-b.jsonl", [{ type: "session_meta", payload: { id: "thread-b", originator: "codex_sdk_ts" } }]);
    const { listImportable } = await import("@/features/sessions/server/import/sessionImport");
    expect(await listImportable("codex")).toEqual([]);
  });
});

describe("importSession", () => {
  const session: ImportableSession = { provider: "claude", id: "original", title: "Fix it", cwd: "/work", branch: undefined, lastModified: 0 };

  /** Steps that fork the session and record which forks were deleted. */
  function forkingSteps(discardFails = false): { steps: ImportSteps; discarded: Array<string> } {
    const discarded: Array<string> = [];
    const discard = async (ref: string) => {
      discarded.push(ref);
      if (discardFails) throw new Error("gone already");
    };
    const steps: ImportSteps = { history: async () => [], fork: { make: async () => "fork", discard } };
    return { steps, discarded };
  }

  it("continues the fork and keeps it once the session is taken in", async () => {
    const { importSession } = await import("@/features/sessions/server/import/sessionImport");
    const { steps, discarded } = forkingSteps();
    const inserted: Array<string> = [];
    expect(await importSession(session, async (_, ref) => (inserted.push(ref), "agent"), steps)).toBe("agent");
    expect([inserted, discarded]).toEqual([["fork"], []]);
  });

  it("deletes the fork again when taking the session in fails, and reports that failure", async () => {
    const { importSession } = await import("@/features/sessions/server/import/sessionImport");
    const { steps, discarded } = forkingSteps(true);
    await expect(importSession(session, () => Promise.reject(new Error("disk full")), steps)).rejects.toThrow("disk full");
    expect(discarded).toEqual(["fork"]);
  });

  it("continues a session that is not forked as itself and leaves it alone on failure", async () => {
    const { importSession } = await import("@/features/sessions/server/import/sessionImport");
    const refs: Array<string> = [];
    const steps: ImportSteps = { history: async () => [], fork: undefined };
    await expect(importSession(session, async (_, ref) => (refs.push(ref), Promise.reject(new Error("disk full"))), steps)).rejects.toThrow("disk full");
    expect(refs).toEqual(["original"]);
  });
});
