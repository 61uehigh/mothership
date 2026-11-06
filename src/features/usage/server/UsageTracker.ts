import type { LimitWindow, ProviderUsage, UsageSnapshot, UsageWindow } from "@/features/usage/model/Usage";
import { CpuMeter } from "@/features/usage/server/CpuMeter";
import { CLAUDE_NO_LIMITS_CODE, claudeWindows, mergeClaudeWindows, readClaudeLimits } from "@/features/usage/server/claudeLimits";
import { readCodexLimits } from "@/features/usage/server/codexLimits";
import { memoryUsedPercent } from "@/features/usage/server/SystemMonitor";
import { errorMessage } from "@/lib/errors";
import { CLAUDE_LOGIN_CODE, claudeAuthFailedAt } from "@/platform/claudeLogin";
import { HttpError } from "@/platform/http/HttpError";

/** How long after the last full read of Claude's limits a status bar poll reads them again (free: no model call). */
const CLAUDE_REFRESH_MS = 5 * 60_000;
/** The same, after a read that showed this login has no plan limits to read; each read starts a Claude Code process. */
const CLAUDE_NO_LIMITS_REFRESH_MS = 60 * 60_000;
/** With no Claude numbers yet, how long a snapshot waits for the first read. */
const CLAUDE_FIRST_READ_WAIT_MS = 5_000;

/**
 * ### claudeReadDue
 *
 * Whether a status bar poll should read Claude's limits again. A login with
 * no plan limits (an API key only, or logged out) or one Claude refused
 * cannot succeed by retrying, so it is retried hourly instead of every
 * {@link CLAUDE_REFRESH_MS}; a refused login is retried as usual again once
 * another call to Claude got through.
 *
 * @param sinceRead - Milliseconds since the last full read started.
 * @param failure - The `code` the last background read failed with; `undefined` after a success.
 * @param loginRefused - Claude refused the login and nothing got through since (`claudeAuthFailedAt`).
 */
export function claudeReadDue(sinceRead: number, failure: string | undefined, loginRefused: boolean): boolean {
  const hopeless = failure === CLAUDE_NO_LIMITS_CODE || (failure === CLAUDE_LOGIN_CODE && loginRefused);
  return sinceRead >= (hopeless ? CLAUDE_NO_LIMITS_REFRESH_MS : CLAUDE_REFRESH_MS);
}

/**
 * ### UsageTracker
 *
 * Collects subscription limits and machine load for the status bar, in
 * memory only. Claude numbers arrive with every Claude run (agents and the
 * connector relay call {@link UsageTracker.recordClaude}), and snapshots read
 * them again when the last full read is older than {@link CLAUDE_REFRESH_MS},
 * the way Claude Code's `/usage` does (no model call). Codex numbers are read
 * from Codex's own session log, so they are as fresh as its last run.
 */
export class UsageTracker {
  #claude: ProviderUsage | undefined;
  #cpu = new CpuMeter();
  /** Epoch milliseconds the last read of Claude's limits started. */
  #claudeReadAt = 0;
  #claudeRead: Promise<void> | undefined;
  /** Why the last background read failed, so the same reason is logged once and hopeless logins are retried less. */
  #claudeReadFailure: { reason: string; code: string | undefined } | undefined;

  /**
   * ### recordClaude
   *
   * @param info - `rate_limit_info` from a Claude SDK `rate_limit_event`; other shapes are ignored.
   */
  recordClaude(info: unknown): void {
    const windows = claudeWindows(info);
    if (windows.length === 0) return;
    this.#setClaude(mergeClaudeWindows(this.#claude?.windows ?? [], windows), this.#claude?.plan);
  }

  #setClaude(windows: Array<LimitWindow>, plan: string | undefined): void {
    const pick = (id: string): UsageWindow | undefined => {
      const window = windows.find((w) => w.id === id);
      return window === undefined ? undefined : { usedPercent: window.usedPercent, resetsAt: window.resetsAt };
    };
    this.#claude = { fiveHour: pick("five_hour"), weekly: pick("seven_day"), windows, plan, observedAt: Date.now() };
  }

  /** The read under way, shared by background refreshes and probes, so only one Claude Code process runs at a time. */
  #startRead(): Promise<void> {
    if (this.#claudeRead === undefined) {
      this.#claudeReadAt = Date.now();
      this.#claudeRead = readClaudeLimits()
        .then(({ windows, plan }) => {
          this.#setClaude(windows, plan);
          this.#claudeReadFailure = undefined;
        })
        .finally(() => (this.#claudeRead = undefined));
    }
    return this.#claudeRead;
  }

  /**
   * Starts a read of Claude's limits when {@link claudeReadDue} says so.
   * Measured from the read, not from `rate_limit_event`s, which carry fewer
   * windows and would otherwise put the full read off for as long as agents
   * keep running.
   */
  #refreshClaude(): Promise<void> {
    if (this.#claudeRead !== undefined) return this.#claudeRead.catch(() => undefined);
    if (!claudeReadDue(Date.now() - this.#claudeReadAt, this.#claudeReadFailure?.code, claudeAuthFailedAt() !== undefined)) return Promise.resolve();
    return this.#startRead().catch((error: unknown) => {
      const reason = errorMessage(error);
      // Logged once per reason, not every few minutes while it lasts.
      if (reason !== this.#claudeReadFailure?.reason) console.warn(`[usage] Reading Claude limits failed: ${reason}`);
      this.#claudeReadFailure = { reason, code: error instanceof HttpError ? error.code : undefined };
    });
  }

  /**
   * ### probeClaude
   *
   * Reads Claude's limits now, the way `/usage` does: no model call, no
   * tokens used. Joins a read already under way rather than starting another.
   *
   * @throws HttpError From `readClaudeLimits` when Claude refuses the login,
   *   reports no plan limits, or the read fails.
   */
  async probeClaude(): Promise<void> {
    await this.#startRead();
  }

  /**
   * ### snapshot
   *
   * Also reads Claude's limits again when they are due: in the background,
   * except that with none known yet (right after start) it waits up to
   * {@link CLAUDE_FIRST_READ_WAIT_MS} so the first poll already has them.
   *
   * @returns Current numbers; CPU is the average since the previous call.
   */
  async snapshot(): Promise<UsageSnapshot> {
    const read = this.#refreshClaude();
    if (this.#claude === undefined) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([read, new Promise<void>((resolve) => (timer = setTimeout(resolve, CLAUDE_FIRST_READ_WAIT_MS)))]);
      clearTimeout(timer);
    }
    const [codex, memoryPercent] = await Promise.all([readCodexLimits().catch(() => undefined), memoryUsedPercent()]);
    return { claude: this.#claude, codex, cpuPercent: this.#cpu.percent(), memoryPercent };
  }
}
