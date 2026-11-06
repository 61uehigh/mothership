import type { z } from "zod";
import type { AgentKind, compareAttemptSchema } from "@/features/sessions/model/AgentEvents";

/**
 * ### COMPARE_NAME_MAX
 *
 * The longest name of a compare run, in characters: shorter than a
 * session's, since each attempt's session adds `-<provider>-<n>` to it.
 * `POST /api/compare` and the New session dialog's Name field both use it.
 */
export const COMPARE_NAME_MAX = 60;

/**
 * ### CompareAttempt
 *
 * One attempt of a compare run, as {@link compareAttemptSchema} parses it.
 */
export type CompareAttempt = z.infer<typeof compareAttemptSchema>;

/**
 * ### compareAttemptNames
 *
 * Names the sessions of a compare run `<name>-<provider>`, adding the
 * attempt's 1-based position only when its backend appears more than once,
 * so two Claude attempts never share a name (and a worktree branch).
 *
 * @returns One name per attempt, in the same order.
 */
export function compareAttemptNames(name: string, attempts: ReadonlyArray<{ provider: AgentKind }>): Array<string> {
  return attempts.map((attempt, index) => {
    const repeated = attempts.filter((a) => a.provider === attempt.provider).length > 1;
    return `${name}-${attempt.provider}${repeated ? `-${index + 1}` : ""}`;
  });
}
