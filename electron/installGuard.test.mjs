import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeRunning, parseWaitMinutes, runningInstalledSessions, SERVER_INFO_FILE, waitUntilIdle } from "./installGuard.mjs";

describe("runningInstalledSessions", () => {
  let dataDir;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (dataDir !== undefined) rmSync(dataDir, { recursive: true, force: true });
  });

  /** A data folder whose server answers `body`, and no session database. */
  function serverAnswering(body) {
    dataDir = mkdtempSync(path.join(tmpdir(), "install-guard-"));
    writeFileSync(path.join(dataDir, SERVER_INFO_FILE), JSON.stringify({ port: 1 }));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 200 }));
  }

  it("returns the server's list", async () => {
    serverAnswering({ running: [{ id: "a", name: "fix-tests" }] });
    expect(await runningInstalledSessions(dataDir)).toEqual([{ id: "a", name: "fix-tests" }]);
  });

  it("falls back to the database when the answer has no list, instead of returning undefined", async () => {
    serverAnswering({ error: "Not found" });
    expect(await runningInstalledSessions(dataDir)).toEqual([]);
  });
});

describe("parseWaitMinutes", () => {
  it("reads the flag, and falls back when it is absent", () => {
    expect(parseWaitMinutes(["--install", "--wait-minutes=5"], 30)).toBe(5);
    expect(parseWaitMinutes(["--wait-minutes=0"], 30)).toBe(0);
    expect(parseWaitMinutes(["--install"], 30)).toBe(30);
  });

  it("refuses what is not a number of minutes, which would poll forever", () => {
    for (const value of ["abc", "", "-1", "Infinity"]) {
      expect(() => parseWaitMinutes([`--wait-minutes=${value}`], 30)).toThrow(/--wait-minutes/);
    }
  });
});

/** A clock that only moves when the code under test sleeps. */
function fakeClock() {
  let time = 0;
  return { now: () => time, sleep: async (ms) => void (time += ms) };
}

const session = (id, lead) => ({ id, name: id, ...(lead === undefined ? {} : { lead }) });

describe("waitUntilIdle", () => {
  it("returns at once when nothing is working, without a word", async () => {
    const lines = [];
    const result = await waitUntilIdle({ ...fakeClock(), check: async () => [], timeoutMs: 60_000, pollMs: 5_000, progressMs: 60_000, log: (l) => lines.push(l) });
    expect(result).toEqual({ idle: true });
    expect(lines).toEqual([]);
  });

  it("waits for working sessions, saying which, and again when the set changes", async () => {
    const clock = fakeClock();
    const answers = [[session("a"), session("b", "Lead")], [session("a"), session("b", "Lead")], [session("a")], []];
    const lines = [];
    const result = await waitUntilIdle({ ...clock, check: async () => answers.shift() ?? [], timeoutMs: 60_000, pollMs: 5_000, progressMs: 60_000, log: (l) => lines.push(l) });
    expect(result).toEqual({ idle: true });
    expect(clock.now()).toBe(15_000);
    expect(lines).toEqual([
      "Waiting for 2 working sessions to finish:\n  • a\n  • b (in Lead)",
      "Waiting for 1 working session to finish:\n  • a",
      "All sessions finished.",
    ]);
  });

  it("reports progress while nothing changes, and gives up at the timeout", async () => {
    const clock = fakeClock();
    const lines = [];
    const result = await waitUntilIdle({ ...clock, check: async () => [session("slow")], timeoutMs: 150_000, pollMs: 5_000, progressMs: 60_000, log: (l) => lines.push(l) });
    expect(result).toEqual({ idle: false, running: [session("slow")] });
    expect(clock.now()).toBe(150_000);
    expect(lines).toEqual(["Waiting for 1 working session to finish:\n  • slow", "Still waiting (1 min of 3)…", "Still waiting (2 min of 3)…"]);
  });
});

describe("describeRunning", () => {
  it("lists each session, with its lead for a sub-agent", () => {
    expect(describeRunning([session("fix"), session("tests", "Release")])).toBe("  • fix\n  • tests (in Release)");
  });
});
