/**
 * ### CLAUDE_LOGIN_CODE
 *
 * The `code` routes answer with when Claude refused your login, so the
 * browser can offer to log in again.
 */
export const CLAUDE_LOGIN_CODE = "claude-login";

// What the Claude Code CLI and the API say when the login or key is no good.
const AUTH_FAILURE = /failed to authenticate|oauth (session|token) (has )?expired|authentication_error|invalid (x-)?api[ -]key|please run \/login|not logged in/i;

/**
 * ### isClaudeAuthFailure
 *
 * @returns Whether `message` says Claude refused your login or API key.
 */
export function isClaudeAuthFailure(message: string): boolean {
  return AUTH_FAILURE.test(message);
}

// On `globalThis` because each route can load its own copy of this module.
const globalRef = globalThis as typeof globalThis & { __mothershipClaudeAuthFailedAt?: number };

/**
 * ### noteClaudeAuth
 *
 * Records how the last call to Claude went, so Settings can say the login
 * expired even though an account is still saved.
 *
 * @param failed - Claude refused the login; `false` after any call that got through.
 */
export function noteClaudeAuth(failed: boolean): void {
  if (failed) globalRef.__mothershipClaudeAuthFailedAt = Date.now();
  else delete globalRef.__mothershipClaudeAuthFailedAt;
}

/**
 * ### claudeAuthFailedAt
 *
 * @returns Epoch milliseconds of the last refused login with no call
 *   getting through since, or `undefined`.
 */
export function claudeAuthFailedAt(): number | undefined {
  return globalRef.__mothershipClaudeAuthFailedAt;
}
