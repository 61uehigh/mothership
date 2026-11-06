import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { codexLimitsFromLog, codexWindows, recentCodexLogs } from "@/features/usage/server/codexLimits";

const window = (minutes: number, used: number) => ({ used_percent: used, window_minutes: minutes, resets_at: 1_000 });

describe("codexWindows", () => {
  it("reads a plan with both limits: 5-hour primary, weekly secondary", () => {
    const read = codexWindows({ primary: window(300, 97), secondary: window(10080, 11) });
    expect(read?.fiveHour).toEqual({ usedPercent: 97, resetsAt: 1_000_000 });
    expect(read?.weekly).toEqual({ usedPercent: 11, resetsAt: 1_000_000 });
    expect(read?.windows.map((w) => w.minutes)).toEqual([300, 10080]);
  });

  it("reads a weekly-only plan, whose weekly window comes as primary", () => {
    const read = codexWindows({ primary: window(10080, 15), secondary: null });
    expect(read?.fiveHour).toBeUndefined();
    expect(read?.weekly).toEqual({ usedPercent: 15, resetsAt: 1_000_000 });
    expect(read?.windows.map((w) => w.minutes)).toEqual([10080]);
  });

  it("keeps a window of another length in the list only", () => {
    const read = codexWindows({ primary: window(1440, 40) });
    expect(read).toMatchObject({ fiveHour: undefined, weekly: undefined });
    expect(read?.windows.map((w) => w.minutes)).toEqual([1440]);
    expect(codexWindows({ primary: "x" })).toBeUndefined();
  });
});

describe("codexWindows plan", () => {
  it("reads the plan from plan_type", () => {
    const read = codexWindows({ primary: window(10080, 15), secondary: null, plan_type: "self_serve_business_prolite" });
    expect(read?.plan).toBe("self_serve_business_prolite");
  });

  it("leaves the plan undefined when missing or of another type, keeping the windows", () => {
    expect(codexWindows({ primary: window(300, 1), secondary: window(10080, 2) })?.plan).toBeUndefined();
    expect(codexWindows({ primary: window(300, 1), plan_type: null })?.plan).toBeUndefined();
    const odd = codexWindows({ primary: window(300, 1), plan_type: 7 });
    expect(odd?.plan).toBeUndefined();
    expect(odd?.windows).toHaveLength(1);
  });
});

const limits = (used: number) => ({ primary: { used_percent: used, window_minutes: 300 }, secondary: null });
const line = (rateLimits: unknown) => JSON.stringify({ type: "event_msg", payload: { type: "token_count", rate_limits: rateLimits } });

describe("codexLimitsFromLog", () => {
  it("goes back past newer records whose limits are null", () => {
    const text = ["{cut mid-li", line(limits(10)), line(limits(42)), line(null), '{"payload":{"rate_limits":"x"}}', ""].join("\n");
    expect(codexLimitsFromLog(text)?.fiveHour?.usedPercent).toBe(42);
  });

  it("is undefined when no record has limits", () => {
    expect(codexLimitsFromLog([line(null), "{cut"].join("\n"))).toBeUndefined();
  });
});

describe("recentCodexLogs", () => {
  it("picks the most recently written log across day folders, not only the newest folder", async () => {
    const sessions = await mkdtemp(path.join(tmpdir(), "codex-"));
    const write = async (day: string, name: string, writtenAt: number) => {
      const dir = path.join(sessions, ...day.split("/"));
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, name);
      await writeFile(file, "");
      await utimes(file, writtenAt, writtenAt);
      return file;
    };
    const resumed = await write("2026/11/02", "rollout-old.jsonl", 3_000);
    const newest = await write("2026/11/20", "rollout-new.jsonl", 2_000);
    await write("2026/10/31", "rollout-older.jsonl", 1_000);
    expect(await recentCodexLogs(sessions, 2)).toEqual([resumed, newest]);
  });

  it("is empty without a sessions folder", async () => {
    expect(await recentCodexLogs(path.join(tmpdir(), "no-such-codex-folder"), 3)).toEqual([]);
  });
});
