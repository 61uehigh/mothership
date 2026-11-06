import type { ApiFailure } from "@/ui/useJson";

/**
 * ### isClaudeLoginFailure
 *
 * @returns Whether a route failed because Claude refused your login: the
 *   `claude-login` code from `platform/claudeLogin`.
 */
export function isClaudeLoginFailure(failure: ApiFailure<string> | undefined): boolean {
  return failure?.code === "claude-login";
}
