// Codex's plan limits, read from the session logs Codex writes during its runs.
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ProviderUsage, UsageWindow } from "@/features/usage/model/Usage";

/** Bytes read from the end of a Codex session log. */
const CODEX_TAIL_BYTES = 256 * 1024;
/** How many of the newest `YYYY/MM/DD` session folders are searched for the most recently written log. */
const CODEX_DAYS_SEARCHED = 7;
/** How many of the most recently written logs are read before giving up on finding limits. */
const CODEX_LOGS_TRIED = 3;
const FIVE_HOURS = 5 * 60;
const ONE_WEEK = 7 * 24 * 60;

// `rate_limits` inside Codex's session log (`~/.codex/sessions/**/rollout-*.jsonl`).
const codexWindowSchema = z.object({ used_percent: z.number(), window_minutes: z.number(), resets_at: z.number().optional() });
const codexLimitsSchema = z.object({
  primary: codexWindowSchema.nullish(),
  secondary: codexWindowSchema.nullish(),
  // Older Codex versions leave the plan out; a value of another type is ignored rather than dropping the record.
  plan_type: z.string().nullish().catch(undefined),
});

function codexWindow(window: z.infer<typeof codexWindowSchema>): UsageWindow {
  return { usedPercent: Math.round(window.used_percent), resetsAt: window.resets_at === undefined ? undefined : window.resets_at * 1000 };
}

/**
 * ### CodexLimits
 *
 * What one Codex log record says about the limits, without when it was written.
 */
export type CodexLimits = Pick<ProviderUsage, "fiveHour" | "weekly" | "windows" | "plan">;

/**
 * ### codexWindows
 *
 * Reads Codex's `rate_limits`. Which slot holds which window depends on the
 * plan: with both, primary is 5-hour and secondary weekly, but a plan without
 * a 5-hour limit sends its weekly window as primary. So windows are matched by
 * their length, not their slot.
 *
 * @returns The 5-hour and weekly windows, if reported, every window, and
 *   the plan (`plan_type`); `undefined` for other shapes.
 */
export function codexWindows(rateLimits: unknown): CodexLimits | undefined {
  const limits = codexLimitsSchema.safeParse(rateLimits);
  if (!limits.success) return undefined;
  const raws = (["primary", "secondary"] as const)
    .flatMap((id) => {
      const raw = limits.data[id];
      return raw == null ? [] : [{ id, raw }];
    })
    .sort((a, b) => a.raw.window_minutes - b.raw.window_minutes);
  const byLength = (minutes: number) => {
    const found = raws.find((w) => w.raw.window_minutes === minutes);
    return found === undefined ? undefined : codexWindow(found.raw);
  };
  return {
    fiveHour: byLength(FIVE_HOURS),
    weekly: byLength(ONE_WEEK),
    windows: raws.map(({ id, raw }) => ({ id, minutes: raw.window_minutes, ...codexWindow(raw) })),
    plan: limits.data.plan_type ?? undefined,
  };
}

/**
 * ### codexLimitsFromLog
 *
 * Codex also writes token-count records with `rate_limits: null`, so the
 * newest record is not always one with numbers; this goes back until one has them.
 *
 * @param text - The end of a Codex session log (JSON lines; the first may be cut).
 * @returns The newest record's limits that parse, or `undefined` when none do.
 */
export function codexLimitsFromLog(text: string): CodexLimits | undefined {
  for (const line of text.split("\n").reverse()) {
    if (!line.includes('"rate_limits"')) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const windows = codexWindows((record as { payload?: { rate_limits?: unknown } } | null)?.payload?.rate_limits);
    if (windows !== undefined) return windows;
  }
  return undefined;
}

async function sortedNames(dir: string): Promise<Array<string>> {
  try {
    return (await readdir(/*turbopackIgnore: true*/ dir)).sort().reverse();
  } catch {
    return [];
  }
}

/**
 * ### recentCodexLogs
 *
 * A resumed Codex session keeps writing to its log in the folder of the day
 * it started, so the newest folder is not enough: the logs of the newest
 * {@link CODEX_DAYS_SEARCHED} day folders are compared by when they were written.
 *
 * @param sessions - Codex's `sessions` folder, laid out `YYYY/MM/DD/rollout-*.jsonl`.
 * @returns Up to `limit` `.jsonl` files, most recently written first; empty when there are none.
 */
export async function recentCodexLogs(sessions: string, limit: number): Promise<Array<string>> {
  const days: Array<string> = [];
  search: for (const year of await sortedNames(sessions)) {
    for (const month of await sortedNames(path.join(sessions, year))) {
      for (const day of await sortedNames(path.join(sessions, year, month))) {
        days.push(path.join(sessions, year, month, day));
        if (days.length === CODEX_DAYS_SEARCHED) break search;
      }
    }
  }
  const files = (
    await Promise.all(
      days.map(async (dir) =>
        Promise.all(
          (await sortedNames(dir))
            .filter((name) => name.endsWith(".jsonl"))
            .map(async (name) => {
              const file = path.join(dir, name);
              return { file, written: (await stat(/*turbopackIgnore: true*/ file)).mtimeMs };
            }),
        ),
      ),
    )
  ).flat();
  return files
    .sort((a, b) => b.written - a.written)
    .slice(0, limit)
    .map((f) => f.file);
}

async function readTail(file: string, bytes: number): Promise<string> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * ### readCodexLimits
 *
 * Codex's limits as of its last run, from its own session logs under
 * `CODEX_HOME` (Codex's default `~/.codex` without it).
 *
 * @returns The newest limits found, dated when their log was written; `undefined` when no log has any.
 */
export async function readCodexLimits(): Promise<ProviderUsage | undefined> {
  const home = process.env.CODEX_HOME || path.join(homedir(), ".codex");
  for (const file of await recentCodexLogs(path.join(home, "sessions"), CODEX_LOGS_TRIED)) {
    const windows = codexLimitsFromLog(await readTail(file, CODEX_TAIL_BYTES));
    if (windows !== undefined) return { ...windows, observedAt: (await stat(/*turbopackIgnore: true*/ file)).mtimeMs };
  }
  return undefined;
}
