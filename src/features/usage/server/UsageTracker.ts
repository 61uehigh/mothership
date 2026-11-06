import { execFile } from "node:child_process";
import { open, readdir, stat } from "node:fs/promises";
import { cpus, freemem, homedir, tmpdir, totalmem } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ProviderUsage, UsageSnapshot, UsageWindow } from "@/features/usage/model/Usage";
import { claudeExecutable } from "@/platform/agentBinaries";

const PROBE_TIMEOUT_MS = 30_000;
const run = promisify(execFile);
const CODEX_SESSIONS = path.join(homedir(), ".codex", "sessions");
/** Bytes read from the end of the newest Codex session log. */
const CODEX_TAIL_BYTES = 256 * 1024;

// `rate_limit_info` of the Claude Agent SDK's `rate_limit_event`.
const claudeInfoSchema = z.object({
  unifiedWindows: z
    .object({
      five_hour: z.object({ utilization: z.number(), resetsAt: z.number().optional() }).optional(),
      seven_day: z.object({ utilization: z.number(), resetsAt: z.number().optional() }).optional(),
    })
    .optional(),
});

// `rate_limits` inside Codex's session log (`~/.codex/sessions/**/rollout-*.jsonl`).
const codexWindowSchema = z.object({ used_percent: z.number(), window_minutes: z.number(), resets_at: z.number().optional() });
const codexLimitsSchema = z.object({ primary: codexWindowSchema.nullish(), secondary: codexWindowSchema.nullish() });

function claudeWindow(window: { utilization: number; resetsAt?: number } | undefined): UsageWindow | undefined {
  if (window === undefined) return undefined;
  // The SDK reports a 0–1 fraction and seconds since the epoch.
  return { usedPercent: Math.round(window.utilization * 100), resetsAt: window.resetsAt === undefined ? undefined : window.resetsAt * 1000 };
}

function codexWindow(window: z.infer<typeof codexWindowSchema> | null | undefined): UsageWindow | undefined {
  if (window == null) return undefined;
  return { usedPercent: Math.round(window.used_percent), resetsAt: window.resets_at === undefined ? undefined : window.resets_at * 1000 };
}

async function newestFile(dir: string, depth: number): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // No Codex sessions yet.
    return undefined;
  }
  // Session folders are named YYYY/MM/DD, so the last name sorts newest.
  const names = entries.map((e) => e.name).sort().reverse();
  for (const name of names) {
    const full = path.join(dir, name);
    if (depth > 0) {
      const found = await newestFile(full, depth - 1);
      if (found !== undefined) return found;
    } else if (name.endsWith(".jsonl")) {
      const files = await Promise.all(
        names.filter((n) => n.endsWith(".jsonl")).map(async (n) => ({ n, t: (await stat(path.join(dir, n))).mtimeMs })),
      );
      return path.join(dir, files.sort((a, b) => b.t - a.t)[0].n);
    }
  }
  return undefined;
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

async function macAvailableMemory(): Promise<number | undefined> {
  try {
    const { stdout } = await run("vm_stat");
    const pageSize = Number(/page size of (\d+) bytes/.exec(stdout)?.[1] ?? 16384);
    const pages = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(stdout)?.[1] ?? 0);
    // Free plus cache macOS reclaims on demand; os.freemem() alone overstates use.
    return (pages("Pages free") + pages("Pages inactive") + pages("Pages speculative") + pages("Pages purgeable")) * pageSize;
  } catch {
    // vm_stat unavailable; caller falls back to os.freemem().
    return undefined;
  }
}

/**
 * ### UsageTracker
 *
 * Collects subscription limits and machine load for the status bar. Claude
 * numbers arrive with every Claude run (agents and the connector relay call
 * {@link UsageTracker.recordClaude}); Codex numbers are read from Codex's own
 * session log, so both are only as fresh as the last run of each.
 */
export class UsageTracker {
  #claude: ProviderUsage | undefined;
  #cpuSample: Array<{ idle: number; total: number }> | undefined;

  /**
   * ### recordClaude
   *
   * @param info - `rate_limit_info` from a Claude SDK `rate_limit_event`; other shapes are ignored.
   */
  recordClaude(info: unknown): void {
    const parsed = claudeInfoSchema.safeParse(info);
    const windows = parsed.success ? parsed.data.unifiedWindows : undefined;
    if (windows === undefined) return;
    this.#claude = {
      fiveHour: claudeWindow(windows.five_hour),
      weekly: claudeWindow(windows.seven_day),
      observedAt: Date.now(),
    };
  }

  /**
   * ### probeClaude
   *
   * Makes one tiny Haiku call (about $0.002 of Claude usage) just to receive
   * fresh limits.
   */
  async probeClaude(): Promise<void> {
    const env = { ...process.env };
    // Limits are reported only for claude.ai subscription logins.
    delete env.ANTHROPIC_API_KEY;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), PROBE_TIMEOUT_MS);
    try {
      const stream = query({
        prompt: "Reply with OK.",
        options: { ...claudeExecutable(), model: "haiku", maxTurns: 1, systemPrompt: "Reply briefly.", cwd: tmpdir(), env, abortController },
      });
      for await (const message of stream) {
        if (message.type === "rate_limit_event") this.recordClaude(message.rate_limit_info);
      }
    } catch (error) {
      if (!abortController.signal.aborted) throw error;
      throw new Error(`The limits check did not finish within ${PROBE_TIMEOUT_MS / 1000} seconds`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  async #codex(): Promise<ProviderUsage | undefined> {
    const file = await newestFile(CODEX_SESSIONS, 3);
    if (file === undefined) return undefined;
    const lines = (await readTail(file, CODEX_TAIL_BYTES)).split("\n").reverse();
    const line = lines.find((l) => l.includes('"rate_limits"'));
    if (line === undefined) return undefined;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      // The tail can start mid-line; an unparsable record just means no data.
      return undefined;
    }
    const limits = codexLimitsSchema.safeParse(
      (record as { payload?: { rate_limits?: unknown } } | null)?.payload?.rate_limits,
    );
    if (!limits.success) return undefined;
    const { primary, secondary } = limits.data;
    // Codex reports the 5-hour window as primary and the weekly one as secondary.
    return { fiveHour: codexWindow(primary), weekly: codexWindow(secondary), observedAt: (await stat(/*turbopackIgnore: true*/ file)).mtimeMs };
  }

  #cpuPercent(): number | undefined {
    const sample = cpus().map((c) => {
      const total = Object.values(c.times).reduce((a, b) => a + b, 0);
      return { idle: c.times.idle, total };
    });
    const previous = this.#cpuSample;
    this.#cpuSample = sample;
    if (previous === undefined) return undefined;
    const idle = sample.reduce((n, s, i) => n + s.idle - (previous[i]?.idle ?? 0), 0);
    const total = sample.reduce((n, s, i) => n + s.total - (previous[i]?.total ?? 0), 0);
    return total <= 0 ? undefined : Math.round((1 - idle / total) * 100);
  }

  /**
   * ### snapshot
   *
   * @returns Current numbers; CPU is the average since the previous call.
   */
  async snapshot(): Promise<UsageSnapshot> {
    const available = process.platform === "darwin" ? await macAvailableMemory() : undefined;
    const total = totalmem();
    return {
      claude: this.#claude,
      codex: await this.#codex().catch(() => undefined),
      cpuPercent: this.#cpuPercent(),
      memoryPercent: Math.round((1 - (available ?? freemem()) / total) * 100),
    };
  }
}
