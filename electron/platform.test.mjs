import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentPlatform, parseWindowsProcesses, stillOurs, windowsTree } from "./platform.mjs";

const proc = (pid, parent, created) => ({ pid, parent, created: String(created) });

describe("parseWindowsProcesses", () => {
  it("reads pid, parent, and creation time, skipping blank and broken lines", () => {
    const stdout = "4 0 133000000000000000\r\n\r\n1200 4 133000000000000100\r\nnot a process\r\n1300 1200\r\n";
    expect(parseWindowsProcesses(stdout)).toEqual([proc(4, 0, "133000000000000000"), proc(1200, 4, "133000000000000100")]);
  });
});

describe("windowsTree", () => {
  it("walks the server's children and theirs", () => {
    const processes = [proc(10, 1, 100), proc(11, 10, 110), proc(12, 11, 120), proc(20, 1, 105)];
    expect(windowsTree(processes, 10).map((p) => p.pid)).toEqual([10, 11, 12]);
  });

  it("skips a process older than its parent pid, whose real parent exited and whose pid was reused", () => {
    const processes = [proc(10, 1, 100), proc(11, 10, 50)];
    expect(windowsTree(processes, 10).map((p) => p.pid)).toEqual([10]);
  });

  it("is empty when the root has gone", () => {
    expect(windowsTree([proc(11, 10, 110)], 10)).toEqual([]);
  });
});

describe("stillOurs", () => {
  const recorded = [proc(11, 10, 110), proc(12, 11, 120)];

  it("kills the recorded processes still running as themselves, and what they started since", () => {
    const current = [proc(11, 10, 110), proc(12, 11, 120), proc(13, 12, 130)];
    expect(stillOurs(recorded, current)).toEqual([11, 12, 13]);
  });

  it("leaves a pid another program took during the wait, and that program's children", () => {
    const current = [proc(12, 999, 500), proc(14, 12, 510)];
    expect(stillOurs(recorded, current)).toEqual([]);
  });

  it("compares creation times longer than a double holds exactly", () => {
    const current = [proc(11, 10, "133000000000000111")];
    expect(stillOurs([proc(11, 10, "133000000000000110")], current)).toEqual([]);
  });
});

describe("POSIX stopTree", () => {
  /** A fake server that exits on SIGTERM, and a group whose other members ignore SIGTERM unless `groupExits`. */
  function setup({ groupExits }) {
    const child = Object.assign(new EventEmitter(), { pid: 4242, exitCode: null, signalCode: null });
    const signals = [];
    let groupRunning = true;
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid === -4242 && signal === 0) {
        if (!groupRunning) throw new Error("ESRCH");
        return true;
      }
      signals.push([pid, signal]);
      if (pid === 4242 && signal === "SIGTERM") queueMicrotask(() => ((child.exitCode = 0), child.emit("exit")));
      if (pid === -4242 && signal === "SIGTERM" && groupExits) groupRunning = false;
      return true;
    });
    return { child, signals };
  }

  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.useFakeTimers();
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", platform);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("kills what ignores the group's SIGTERM once the grace period is over", async () => {
    const { child, signals } = setup({ groupExits: false });
    const done = currentPlatform().stopTree(child, 10_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    expect(signals).toEqual([
      [4242, "SIGTERM"],
      [-4242, "SIGTERM"],
      [-4242, "SIGKILL"],
    ]);
  });

  it("sends no SIGKILL when the group has gone after SIGTERM", async () => {
    const { child, signals } = setup({ groupExits: true });
    const done = currentPlatform().stopTree(child, 10_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    expect(signals).toEqual([
      [4242, "SIGTERM"],
      [-4242, "SIGTERM"],
    ]);
  });
});
