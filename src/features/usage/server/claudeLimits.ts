// Claude's plan limits: the parsers of the Agent SDK's two outside formats, and the `/usage`-style read.
import { tmpdir } from "node:os";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { sameWindow, type LimitWindow, type UsageWindow } from "@/features/usage/model/Usage";
import { errorMessage } from "@/lib/errors";
import { claudeExecutable } from "@/platform/agentBinaries";
import { CLAUDE_LOGIN_CODE, isClaudeAuthFailure, isClaudeLimitFailure, noteClaudeAuth } from "@/platform/claudeLogin";
import { HttpError } from "@/platform/http/HttpError";

/** A read of Claude's limits that takes longer is stopped. */
const CLAUDE_READ_TIMEOUT_MS = 30_000;

/**
 * ### CLAUDE_LIMIT_CODE
 *
 * The `code` of a limits check Claude refused because a usage or spend
 * limit is used up; the error's message is Claude's own text, which says
 * when the limit resets.
 */
export const CLAUDE_LIMIT_CODE = "claude-limit";

/**
 * ### PROBE_TIMEOUT_CODE
 *
 * The `code` of a limits check that took longer than {@link CLAUDE_READ_TIMEOUT_MS}.
 */
export const PROBE_TIMEOUT_CODE = "probe-timeout";

/**
 * ### CLAUDE_NO_LIMITS_CODE
 *
 * The `code` of a limits check Claude answered without plan limits: no
 * claude.ai subscription login (logged out, or an API key only).
 */
export const CLAUDE_NO_LIMITS_CODE = "claude-no-limits";

// The Agent SDK wraps the CLI's error result in this prefix; the rest is Claude's own text.
const ERROR_RESULT_PREFIX = /^Claude Code returned an error result:\s*/i;

/**
 * ### probeFailure
 *
 * Says why a limits check failed in a form a route can answer.
 *
 * @param error - What the Agent SDK threw.
 * @param timedOut - The check was stopped after {@link CLAUDE_READ_TIMEOUT_MS}.
 * @returns 401 {@link CLAUDE_LOGIN_CODE} for a refused login, 429
 *   {@link CLAUDE_LIMIT_CODE} for a used-up limit, 504
 *   {@link PROBE_TIMEOUT_CODE} for a timeout, otherwise 502; each with
 *   Claude's own text as the message.
 */
export function probeFailure(error: unknown, timedOut: boolean): HttpError {
  if (timedOut) {
    return new HttpError(`The limits check did not finish within ${CLAUDE_READ_TIMEOUT_MS / 1000} seconds`, 504, PROBE_TIMEOUT_CODE, { cause: error });
  }
  const text = errorMessage(error).replace(ERROR_RESULT_PREFIX, "").trim();
  if (isClaudeAuthFailure(text)) return new HttpError(text, 401, CLAUDE_LOGIN_CODE, { cause: error });
  if (isClaudeLimitFailure(text)) return new HttpError(text, 429, CLAUDE_LIMIT_CODE, { cause: error });
  return new HttpError(text === "" ? "The limits check failed" : text, 502, undefined, { cause: error });
}

const WEEK_MINUTES = 7 * 24 * 60;

type WindowFacts = Omit<LimitWindow, "usedPercent" | "resetsAt">;

/** Claude's window keys, shortest first, with what the UI names them by. */
const CLAUDE_WINDOWS: ReadonlyArray<WindowFacts> = [
  { id: "five_hour", minutes: 5 * 60 },
  { id: "seven_day", minutes: WEEK_MINUTES },
  { id: "seven_day_opus", minutes: WEEK_MINUTES, model: "Opus" },
  { id: "seven_day_sonnet", minutes: WEEK_MINUTES, model: "Sonnet" },
  { id: "seven_day_oauth_apps", minutes: WEEK_MINUTES, scope: "apps" },
  { id: "seven_day_overage_included", minutes: WEEK_MINUTES, scope: "extra-usage" },
];

/** A window Claude adds later is kept by its key alone, and sorts after the known ones. */
function claudeWindowFacts(id: string): { facts: WindowFacts; order: number } {
  const order = CLAUDE_WINDOWS.findIndex((w) => w.id === id);
  return order === -1 ? { facts: { id, minutes: undefined }, order: CLAUDE_WINDOWS.length } : { facts: CLAUDE_WINDOWS[order], order };
}

// `rate_limit_info` of the Claude Agent SDK's `rate_limit_event`: one entry per window, keyed
// `five_hour`, `seven_day`, `seven_day_opus`, … Entries of another shape are skipped.
const claudeWindowSchema = z.object({ utilization: z.number(), resetsAt: z.number().optional() });
const claudeInfoSchema = z.object({ unifiedWindows: z.record(z.string(), z.unknown()).optional() });

function claudeWindow(window: { utilization: number; resetsAt?: number }): UsageWindow {
  // The SDK reports a 0–1 fraction and seconds since the epoch.
  return { usedPercent: Math.round(window.utilization * 100), resetsAt: window.resetsAt === undefined ? undefined : window.resetsAt * 1000 };
}

/**
 * ### claudeWindows
 *
 * @param info - `rate_limit_info` from a Claude SDK `rate_limit_event`.
 * @returns Every window in it, shortest first; empty for other shapes.
 */
export function claudeWindows(info: unknown): Array<LimitWindow> {
  const parsed = claudeInfoSchema.safeParse(info);
  const windows = parsed.success ? parsed.data.unifiedWindows : undefined;
  if (windows === undefined) return [];
  return Object.entries(windows)
    .flatMap(([id, raw]) => {
      const window = claudeWindowSchema.safeParse(raw);
      if (!window.success) return [];
      const { facts, order } = claudeWindowFacts(id);
      return [{ order, window: { ...facts, ...claudeWindow(window.data) } }];
    })
    .sort((a, b) => a.order - b.order)
    .map(({ window }) => window);
}

// `rate_limits` of the Agent SDK's `/usage` data (`get_usage`): utilization 0–100 and ISO reset times.
const usageWindowSchema = z.object({ utilization: z.number(), resets_at: z.string().nullish() });
const usageLimitsSchema = z.object({
  model_scoped: z.array(z.object({ display_name: z.string(), utilization: z.number().nullable(), resets_at: z.string().nullish() })).optional().catch(undefined),
});

/**
 * ### claudeUsageWindows
 *
 * @param rateLimits - `rate_limits` of the Agent SDK's `/usage` data
 *   (`usage_EXPERIMENTAL…`); keys and per-model windows of other shapes are skipped.
 * @returns Every known window and per-model weekly window, shortest first;
 *   a per-model window that repeats a known one (Opus) is left out.
 */
export function claudeUsageWindows(rateLimits: unknown): Array<LimitWindow> {
  if (typeof rateLimits !== "object" || rateLimits === null) return [];
  const record = rateLimits as Record<string, unknown>;
  const window = (facts: WindowFacts, raw: unknown): Array<LimitWindow> => {
    const parsed = usageWindowSchema.safeParse(raw);
    if (!parsed.success) return [];
    const resetsAt = parsed.data.resets_at == null ? undefined : Date.parse(parsed.data.resets_at);
    return [{ ...facts, usedPercent: Math.round(parsed.data.utilization), resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt }];
  };
  const known = CLAUDE_WINDOWS.flatMap((facts) => window(facts, record[facts.id]));
  const scoped = (usageLimitsSchema.safeParse(record).data?.model_scoped ?? []).flatMap((m) =>
    window({ id: `model_${m.display_name.toLowerCase()}`, minutes: WEEK_MINUTES, model: m.display_name }, m),
  );
  return [...known, ...scoped.filter((m) => !known.some((k) => sameWindow(k, m)))];
}

/**
 * ### mergeClaudeWindows
 *
 * A `rate_limit_event` carries only the unified windows, while a `/usage`
 * read also has per-model ones, so an event updates the windows it names
 * and keeps the rest instead of replacing the list.
 *
 * @returns `known` with each window `fresh` names replaced in place, and
 *   `fresh`'s new ones after; a kept window that counts the same as a fresh
 *   one under another key (`model_opus` beside `seven_day_opus`) is dropped.
 */
export function mergeClaudeWindows(known: Array<LimitWindow>, fresh: Array<LimitWindow>): Array<LimitWindow> {
  const kept = known.flatMap((w) => {
    const update = fresh.find((f) => f.id === w.id);
    if (update !== undefined) return [update];
    return fresh.some((f) => sameWindow(f, w)) ? [] : [w];
  });
  return [...kept, ...fresh.filter((w) => !known.some((k) => k.id === w.id))];
}

/**
 * ### readClaudeLimits
 *
 * Reads Claude's plan limits the way `/usage` does: starts Claude Code
 * without a prompt and asks for its usage data, so no model call is made
 * and no tokens are used. Records the login as working or refused.
 *
 * @returns Every window and the subscription plan.
 * @throws HttpError From {@link probeFailure} when Claude refuses the login,
 *   the read times out, or fails; 409 {@link CLAUDE_NO_LIMITS_CODE} when
 *   Claude reports no plan limits (logged out, or an API key only).
 */
export async function readClaudeLimits(): Promise<{ windows: Array<LimitWindow>; plan: string | undefined }> {
  const env = { ...process.env };
  // Plan limits are reported only for claude.ai subscription logins.
  delete env.ANTHROPIC_API_KEY;
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  // A prompt that never sends a message: the process starts, answers control requests, and makes no model call.
  async function* noPrompt(): AsyncGenerator<never> {
    await hold;
  }
  const abortController = new AbortController();
  const timedOut = new Promise<never>((_, reject) => {
    abortController.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  const timer = setTimeout(() => abortController.abort(), CLAUDE_READ_TIMEOUT_MS);
  const session = query({ prompt: noPrompt(), options: { ...claudeExecutable(), cwd: tmpdir(), env, settingSources: [], abortController } });
  // Drain the stream so the process is not blocked on output; its messages are only start-up notices.
  void (async () => {
    try {
      for await (const message of session) void message;
    } catch {
      // Closing the session ends the stream with an error; nothing to report.
    }
  })();
  let usage;
  try {
    usage = await Promise.race([session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), timedOut]);
  } catch (error) {
    const failure = probeFailure(error, abortController.signal.aborted);
    if (failure.code === CLAUDE_LOGIN_CODE) noteClaudeAuth(true);
    throw failure;
  } finally {
    clearTimeout(timer);
    release();
    session.close();
  }
  const windows = usage.rate_limits_available ? claudeUsageWindows(usage.rate_limits) : [];
  if (windows.length === 0) {
    throw new HttpError("Claude reports no plan limits for this login; they apply to claude.ai subscription logins", 409, CLAUDE_NO_LIMITS_CODE);
  }
  noteClaudeAuth(false);
  return { windows, plan: usage.subscription_type ?? undefined };
}
