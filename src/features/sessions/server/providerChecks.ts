import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { CheckResult } from "@/features/settings/model/Settings";
import { askClaudeJson } from "@/platform/askClaude";
import { claudeAuthFailedAt } from "@/platform/claudeLogin";
import { hasEnvSecret } from "@/platform/envSecret";

/** Only the account fields shown in Settings; the rest of `~/.claude.json` is never read into the view. */
const claudeAccountSchema = z.object({ oauthAccount: z.object({ emailAddress: z.string() }).optional() });

/** How often a refused login is checked again while Settings is open; each check is one short Haiku call. */
const RECHECK_MS = 60_000;
const recheck = globalThis as typeof globalThis & { __mothershipClaudeRecheckAt?: number };

/**
 * A saved account says nothing about whether its login still works, so after
 * Claude refused it, ask once more (at most every minute): a call that gets
 * through clears the refusal, so logging in again shows up here.
 *
 * @returns Whether Claude still refuses the login.
 */
async function loginRefused(): Promise<boolean> {
  if (claudeAuthFailedAt() === undefined) return false;
  if (Date.now() - (recheck.__mothershipClaudeRecheckAt ?? 0) >= RECHECK_MS) {
    recheck.__mothershipClaudeRecheckAt = Date.now();
    await askClaudeJson('Answer with exactly {"ok":true}', z.object({ ok: z.literal(true) }), { what: "Claude login check", model: "haiku", timeoutMs: 30_000 }).catch(() => undefined);
  }
  return claudeAuthFailedAt() !== undefined;
}

async function claudeCheck(): Promise<CheckResult> {
  if (hasEnvSecret("ANTHROPIC_API_KEY")) return { ready: true, reason: "api-key" };
  try {
    const account = claudeAccountSchema.safeParse(JSON.parse(await readFile(path.join(homedir(), ".claude.json"), "utf8")));
    const email = account.success ? account.data.oauthAccount?.emailAddress : undefined;
    if (email !== undefined && (await loginRefused())) return { ready: false, reason: "login-expired", account: email, fix: "login" };
    if (email !== undefined) return { ready: true, reason: "login", account: email };
  } catch {
    // No Claude Code config yet: not logged in.
  }
  return { ready: false, reason: "not-logged-in", fix: "login" };
}

async function codexCheck(): Promise<CheckResult> {
  if (hasEnvSecret("OPENAI_API_KEY")) return { ready: true, reason: "api-key" };
  const loggedIn = await stat(path.join(homedir(), ".codex", "auth.json")).then(
    () => true,
    () => false,
  );
  return loggedIn
    ? { ready: true, reason: "login" }
    : { ready: false, reason: "not-logged-in", fix: "login" };
}

/**
 * ### checkProviders
 *
 * Reads only whether keys are set and logins exist; never a key's value.
 *
 * @returns Whether each agent provider can run.
 */
export async function checkProviders(): Promise<{ claude: CheckResult; codex: CheckResult }> {
  const [claude, codex] = await Promise.all([claudeCheck(), codexCheck()]);
  return { claude, codex };
}
