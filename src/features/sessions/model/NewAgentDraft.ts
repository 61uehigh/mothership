/**
 * ### NewAgentDraft
 *
 * Prefilled values, e.g. when handing a sidebar item (an issue, a thread) to an agent.
 */
export type NewAgentDraft = {
  name?: string;
  role?: string;
  initialMessage?: string;
  /** Directory to work in; defaults to the last one used. */
  repo?: string;
  /** Start with "work in a separate worktree" checked. */
  worktree?: boolean;
};
