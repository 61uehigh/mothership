import type { AgentEvent, AgentKind, Effort } from "@/features/sessions/model/AgentEvents";

/**
 * ### SESSION_NAME_MAX
 *
 * The longest session name, in characters; `POST /api/agents` and the New
 * session dialog's Name field both use it.
 */
export const SESSION_NAME_MAX = 80;

/**
 * ### MERGE_MESSAGE_MAX
 *
 * The longest commit message for a session's uncommitted work when it is
 * merged, in characters; the merge route and the merge dialog both use it.
 */
export const MERGE_MESSAGE_MAX = 500;

/**
 * ### AgentStatus
 *
 * - `idle`: waiting for a message; the last turn finished normally.
 * - `running`: a turn is in progress.
 * - `failed`: the last turn ended with an error; a new message retries.
 * - `interrupted`: stopped by the user, or by mothership stopping or restarting
 *   mid-turn (then `Agent.stoppedByRestart` is set).
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
  /**
   * The last turn was cut off because mothership stopped or restarted (an app
   * update, a quit, a crash), so its status is `interrupted`. Continue picks the
   * conversation up again; cleared when the next turn starts.
   */
  stoppedByRestart: boolean;
  /**
   * The next prompt the agent predicts you will send, shown in the reply box
   * (Tab puts it in). Set after a turn ends; cleared when the next one starts.
   */
  suggestion: string | undefined;
  /** Why mothership itself started the session, e.g. developer mode's feedback; `undefined` for sessions you or agents started. */
  origin: AgentOrigin | undefined;
};

/**
 * ### AgentOrigin
 *
 * A session mothership started for one of its own features: `feedback` is a
 * session developer mode started from feedback on mothership's screen.
 */
export type AgentOrigin = "feedback";

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
 * ### canMergeNow
 *
 * Whether the UI offers Merge for `agent`: its worktree is still active and it
 * is not working. The server refuses a merge while it works
 * (`merge-while-working`), so the button and its shortcut both follow this.
 */
export function canMergeNow(agent: Pick<Agent, "status" | "worktree">): boolean {
  return agent.worktree?.state === "active" && agent.status !== "running";
}

/**
 * ### AgentLink
 *
 * A labelled URL shown as a tag on the agent's card.
 */
export type AgentLink = { label: string; url: string };

/**
 * ### AgentQuestion
 *
 * A question an agent asked the human through `ask_human`, or an action of
 * an agent waiting for your approval.
 * - `open`: waiting in the inbox.
 * - `answered`: the answer was delivered to the agent as a message (for an
 *   approval: to the waiting action, as {@link APPROVAL_ANSWERS}).
 * - `dismissed`: closed without an answer; the agent was told so.
 */
export type AgentQuestion = {
  id: string;
  agentId: string;
  /**
   * - `question`: asked through `ask_human`; any text answers it.
   * - `approval`: an action (`git push`, publishing an Artifact) that runs
   *   only if you allow it; `question` is the action, answered only with
   *   {@link APPROVAL_ANSWERS}.
   */
  kind: "question" | "approval";
  /** The question, or for an approval the action as you read it. */
  question: string;
  /** Suggested answers shown as buttons; free text is always allowed. Empty for an approval. */
  options: Array<string>;
  status: "open" | "answered" | "dismissed";
  answer: string | undefined;
  createdAt: number;
  resolvedAt: number | undefined;
};

/**
 * ### APPROVAL_ANSWERS
 *
 * The only answers an approval question takes, stored as its `answer`. They
 * are ids, not labels: the inbox shows them in your language.
 */
export const APPROVAL_ANSWERS = { allow: "allow", deny: "deny" } as const;

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
  event: Exclude<AgentEvent, { type: "session" | "usage" }> | ImportNote;
  createdAt: number;
};

/**
 * ### ImportNote
 *
 * Where an imported session's earlier conversation ends, recorded after it
 * as a fact the UI words: the tool it came from and whether mothership
 * continues a fork (the original stays untouched) or the same conversation.
 */
export type ImportNote = { type: "imported"; from: AgentKind; forked: boolean };

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
  /** A queued message was cancelled before its turn started. */
  | { type: "messageRemoved"; agentId: string; messageId: string }
  | { type: "event"; record: AgentEventRecord };
