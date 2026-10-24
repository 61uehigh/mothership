import type { AgentEvent, AgentKind, Effort } from "@/features/sessions/model/AgentEvents";

/**
 * ### AgentStatus
 *
 * - `idle`: waiting for a message; the last turn finished normally.
 * - `running`: a turn is in progress.
 * - `failed`: the last turn ended with an error; a new message retries.
 * - `interrupted`: stopped by the user or by a server restart mid-turn.
 */
export type AgentStatus = "idle" | "running" | "failed" | "interrupted";

/**
 * ### Agent
 *
 * A long-lived agent session. Survives server restarts; its provider-side
 * conversation continues through `sessionRef`.
 */
export type Agent = {
  id: string;
  name: string;
  /** Key in `config/roles.yaml` this agent was created from, if any. */
  role: string | undefined;
  provider: AgentKind;
  model: string | undefined;
  effort: Effort | undefined;
  /** The agent that created this one; `undefined` for agents a human created. */
  parentId: string | undefined;
  status: AgentStatus;
  /** Provider conversation id; `undefined` until the first turn starts. */
  sessionRef: string | undefined;
  workingDirectory: string;
  /** MCP server names this agent may use; `undefined` means all enabled servers. */
  mcp: Array<string> | undefined;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds of the last message, event, or status change. */
  lastActivityAt: number;
  /** One-line progress note the agent sets itself, e.g. "Fixing tests (2/3)". */
  statusNote: string | undefined;
  /** Things the agent attached to itself: an issue, a PR, a document. */
  links: Array<AgentLink>;
  /** The agent's own git worktree, when it works in isolation; `workingDirectory` points into it. */
  worktree: Worktree | undefined;
  /** Agents created together to try the same task; the human picks one to merge. */
  compareGroup: string | undefined;
  /** Epoch milliseconds the human archived the session; `undefined` while it is in the list. */
  archivedAt: number | undefined;
  /**
   * The human let this session run `git` in its folder (Claude only): commits,
   * history edits, fetch, and push, with every push approved by the human.
   * Off by default and never passed on to sub-agents.
   */
  allowGit: boolean;
};

/**
 * ### Worktree
 *
 * An isolated checkout of `repo` on its own branch.
 * - `active`: the agent works here; changes can be reviewed.
 * - `merged`: merged into `baseBranch`; the directory is gone.
 * - `discarded`: thrown away; the directory and branch are gone.
 */
export type Worktree = {
  /** Top-level directory of the user's repository. */
  repo: string;
  path: string;
  branch: string;
  /** Commit the branch started from; diffs are taken against it. */
  baseCommit: string;
  /** Branch that was checked out in `repo` when the worktree was made; merges go here. */
  baseBranch: string;
  state: "active" | "merged" | "discarded";
};

/**
 * ### AgentLink
 *
 * A labelled URL shown as a tag on the agent's card.
 */
export type AgentLink = { label: string; url: string };

/**
 * ### AgentQuestion
 *
 * A question an agent asked the human through `ask_human`.
 * - `open`: waiting in the inbox.
 * - `answered`: the answer was delivered to the agent as a message.
 * - `dismissed`: closed without an answer; the agent was told so.
 */
export type AgentQuestion = {
  id: string;
  agentId: string;
  question: string;
  /** Suggested answers shown as buttons; free text is always allowed. */
  options: Array<string>;
  status: "open" | "answered" | "dismissed";
  answer: string | undefined;
  createdAt: number;
  resolvedAt: number | undefined;
};

/**
 * ### AgentMessage
 *
 * An instruction delivered to an agent as one turn. Messages queue while the
 * agent is running and are delivered in order.
 */
export type AgentMessage = {
  id: string;
  agentId: string;
  /** Sending agent; `undefined` means the human or mothership itself. */
  senderId: string | undefined;
  /**
   * - `message`: a normal instruction or request.
   * - `report`: an automatic report of another agent's finished turn.
   * - `system`: from mothership itself, e.g. a delivered answer to `ask_human`.
   *
   * Turns started by `report` and `system` messages never trigger reports of
   * their own, which keeps two agents from replying to each other forever.
   */
  kind: MessageKind;
  text: string;
  createdAt: number;
  /** When the runtime started the turn for it; `undefined` while queued. */
  deliveredAt: number | undefined;
};

/**
 * ### MessageKind
 *
 * See {@link AgentMessage.kind}.
 */
export type MessageKind = "message" | "report" | "system";

/**
 * ### AgentEventRecord
 *
 * A persisted {@link AgentEvent}, minus `session` events (they only update
 * `Agent.sessionRef`) and `usage` events (they only feed the status bar).
 */
export type AgentEventRecord = {
  id: number;
  agentId: string;
  event: Exclude<AgentEvent, { type: "session" | "usage" }>;
  createdAt: number;
};

/**
 * ### LiveUpdate
 *
 * What the server pushes to connected browsers over SSE.
 */
export type LiveUpdate =
  | { type: "agent"; agent: Agent }
  /** The agent and its history were deleted; drop everything that refers to it. */
  | { type: "agentDeleted"; agentId: string }
  | { type: "question"; question: AgentQuestion }
  | { type: "message"; message: AgentMessage }
  | { type: "event"; record: AgentEventRecord };
